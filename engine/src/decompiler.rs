// src/decompiler.rs — Full Decompiler (upgraded)
//
// Pipeline:
//   1. SymExec::run()         — inter-block symbolic execution + constant folding
//   2. lift_functions()       — group blocks into functions via dispatcher + DFS
//   3. structurize()          — convert IfGoto chains to if/else/require
//   4. emit_solidity()        — render clean pseudo-Solidity

use crate::analysis::AnalysisOptions;
use crate::cfg::CFG;
use crate::disasm::Disassembly;
use crate::private_functions::PrivateFunctionCandidate;
use crate::signatures::SignatureReport;
use crate::symbolic::{BlockResult, Stmt, SymExec, SymbolicStats};
use crate::types::{CalldataParam, EvmType, StorageVar};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DecompiledOutput {
    pub pseudo_source: String,
    pub functions: Vec<DecompiledFn>,
    pub storage_slots: Vec<StorageSlotOut>,
    pub mapping_candidates: Vec<MappingOut>,
    pub symbolic_stats: SymbolicStats,
    pub total_params: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DecompiledFn {
    pub selector: Option<String>,
    pub name: String,
    pub params: Vec<ParamOut>,
    pub returns: Vec<ParamOut>,
    pub body: Vec<String>,
    pub is_view: bool,
    pub is_payable: bool,
    pub start_block: usize,
    pub block_ids: Vec<usize>,
    pub is_private_candidate: bool,
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParamOut {
    pub name: String,
    pub ty: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageSlotOut {
    pub slot: u64,
    pub name: String,
    pub ty: String,
    pub reads: usize,
    pub writes: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MappingOut {
    pub expression: String,
    pub reads: usize,
    pub writes: usize,
    pub confidence: f32,
}

// ── Function grouping ─────────────────────────────────────────────────────

struct FnGroup {
    selector: Option<String>,
    name: String,
    abi_signature: Option<String>,
    entry_block: usize,
    block_ids: Vec<usize>,
    params: Vec<CalldataParam>,
    is_payable: bool,
    is_private_candidate: bool,
    confidence: f32,
}

fn collect_reachable(entry: usize, cfg: &CFG, visited: &mut rustc_hash::FxHashSet<usize>) {
    if visited.contains(&entry) {
        return;
    }
    visited.insert(entry);
    for &succ in &cfg.blocks[entry].successors {
        collect_reachable(succ, cfg, visited);
    }
}

fn lift_functions(
    cfg: &CFG,
    sigs: &SignatureReport,
    results: &FxHashMap<usize, BlockResult>,
    private_candidates: &[PrivateFunctionCandidate],
) -> Vec<FnGroup> {
    let mut groups: Vec<FnGroup> = Vec::new();
    let mut covered: rustc_hash::FxHashSet<usize> = rustc_hash::FxHashSet::default();

    let off_to_bid: FxHashMap<usize, usize> =
        cfg.offset_to_block.iter().map(|&(o, b)| (o, b)).collect();

    for sig in &sigs.functions {
        if let Some(tgt_offset) = sig.jump_target {
            if let Some(&entry_bid) = off_to_bid.get(&tgt_offset) {
                let mut block_ids_set = rustc_hash::FxHashSet::default();
                collect_reachable(entry_bid, cfg, &mut block_ids_set);
                let mut ids: Vec<usize> = block_ids_set.iter().copied().collect();
                ids.sort_unstable();

                let params: Vec<CalldataParam> = ids
                    .iter()
                    .flat_map(|bid| {
                        results
                            .get(bid)
                            .map(|r| r.params.clone())
                            .unwrap_or_default()
                    })
                    .collect();

                let is_payable = ids.iter().any(|bid| {
                    results.get(bid).map(|r| {
                        r.stmts.iter().any(|s| matches!(s, Stmt::Assign { rhs, .. } if rhs.contains("msg.value")))
                    }).unwrap_or(false)
                });

                for &bid in &ids {
                    covered.insert(bid);
                }

                let name = sig
                    .known_name
                    .clone()
                    .map(|n| n.split('(').next().unwrap_or(&n).to_string())
                    .unwrap_or_else(|| format!("fn_{}", &sig.selector[2..6]));

                groups.push(FnGroup {
                    selector: Some(sig.selector.clone()),
                    name,
                    abi_signature: sig.known_name.clone(),
                    entry_block: entry_bid,
                    block_ids: ids,
                    params,
                    is_payable,
                    is_private_candidate: false,
                    confidence: 0.95,
                });
            }
        }
    }

    for candidate in private_candidates {
        if covered.contains(&candidate.entry_block) {
            continue;
        }
        let params: Vec<CalldataParam> = candidate
            .body_blocks
            .iter()
            .flat_map(|block_id| {
                results
                    .get(block_id)
                    .map(|result| result.params.clone())
                    .unwrap_or_default()
            })
            .collect();
        for block_id in &candidate.body_blocks {
            covered.insert(*block_id);
        }
        groups.push(FnGroup {
            selector: None,
            name: format!("internal_{:x}", candidate.entry_offset),
            abi_signature: None,
            entry_block: candidate.entry_block,
            block_ids: candidate.body_blocks.clone(),
            params,
            is_payable: false,
            is_private_candidate: true,
            confidence: candidate.confidence,
        });
    }

    if !covered.contains(&0) {
        let mut ids_set = rustc_hash::FxHashSet::default();
        ids_set.insert(0);
        for &succ in &cfg.blocks[0].successors {
            if !covered.contains(&succ) {
                ids_set.insert(succ);
            }
        }
        let mut block_ids: Vec<usize> = ids_set.into_iter().collect();
        block_ids.sort_unstable();
        for &bid in &block_ids {
            covered.insert(bid);
        }
        groups.push(FnGroup {
            selector: None,
            name: "fallback".into(),
            abi_signature: None,
            entry_block: 0,
            block_ids,
            params: vec![],
            is_payable: false,
            is_private_candidate: false,
            confidence: 0.4,
        });
    }

    groups
}

fn structurize(
    block_ids: &[usize],
    results: &FxHashMap<usize, BlockResult>,
    cfg: &CFG,
    indent: usize,
) -> Vec<String> {
    let ind = "    ".repeat(indent);
    let mut out: Vec<String> = Vec::new();
    let mut emitted: rustc_hash::FxHashSet<usize> = rustc_hash::FxHashSet::default();

    for &bid in block_ids {
        if emitted.contains(&bid) {
            continue;
        }
        emitted.insert(bid);

        let result = match results.get(&bid) {
            Some(r) => r,
            None => continue,
        };

        if let Some(loop_info) = cfg
            .control
            .loops
            .iter()
            .find(|loop_info| loop_info.header_block == bid)
        {
            out.push(format!(
                "{ind}// loop header recovered from back-edge block_{} (confidence {:.2})",
                loop_info.back_edge_from, loop_info.confidence
            ));
        }
        if cfg.control.switch_like_blocks.contains(&bid) {
            out.push(format!(
                "{ind}// switch-like dispatch candidate at block_{bid}"
            ));
        }

        let preds = &cfg.blocks[bid].predecessors;
        if preds.len() > 1 && bid != 0 {
            out.push(format!("{ind}/* ── block_{bid} ── */"));
        }

        for stmt in &result.stmts {
            match stmt {
                Stmt::Require { cond, msg } => match msg {
                    Some(m) => out.push(format!("{ind}require({cond}, \"{m}\");")),
                    None => out.push(format!("{ind}require({cond});")),
                },
                Stmt::IfGoto { cond, target } => {
                    let target_bid = cfg
                        .offset_to_block
                        .iter()
                        .find(|(off, _)| *off == *target)
                        .map(|(_, b)| *b);

                    if let Some(tbid) = target_bid {
                        let is_revert = results
                            .get(&tbid)
                            .map(|r| r.stmts.iter().any(|s| matches!(s, Stmt::Revert { .. })))
                            .unwrap_or(false);

                        if is_revert {
                            out.push(format!("{ind}require(!({cond}));"));
                            emitted.insert(tbid);
                        } else {
                            out.push(format!("{ind}if ({cond}) {{"));
                            let inner = structurize(&[tbid], results, cfg, indent + 1);
                            out.extend(inner);
                            out.push(format!("{ind}}}"));
                            emitted.insert(tbid);
                        }
                    } else {
                        out.push(stmt.render(&ind));
                    }
                }
                Stmt::Goto { target } => {
                    let is_seq = block_ids
                        .iter()
                        .position(|&b| b == bid)
                        .and_then(|i| block_ids.get(i + 1))
                        .map(|&next| cfg.blocks[next].start_offset == *target)
                        .unwrap_or(false);
                    if !is_seq {
                        out.push(stmt.render(&ind));
                    }
                }
                Stmt::Comment(c) if c.starts_with("SLOAD") => { /* suppress */ }
                Stmt::MStore { .. } => { /* suppress low-level */ }
                other => out.push(other.render(&ind)),
            }
        }
    }

    out
}

fn reconstruct_params(group: &FnGroup) -> Vec<ParamOut> {
    // Parse types from function signature name like "transfer(address,uint256)"
    let signature = group.abi_signature.as_deref().unwrap_or(&group.name);
    let type_list: Vec<EvmType> = signature
        .find('(')
        .map(|start| {
            let end = signature.rfind(')').unwrap_or(signature.len());
            let inner = &signature[start + 1..end];
            inner
                .split(',')
                .map(str::trim)
                .map(|t| {
                    if t == "address" {
                        EvmType::Address
                    } else if let Some(width) = t.strip_prefix("uint") {
                        EvmType::Uint(width.parse().unwrap_or(256))
                    } else if let Some(width) = t.strip_prefix("int") {
                        EvmType::Int(width.parse().unwrap_or(256))
                    } else if t == "bool" {
                        EvmType::Bool
                    } else if t == "bytes" {
                        EvmType::BytesDynamic
                    } else if let Some(width) = t.strip_prefix("bytes") {
                        EvmType::Bytes(width.parse().unwrap_or(32))
                    } else {
                        EvmType::Unknown
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    // Deduplicate params by index
    let mut seen = rustc_hash::FxHashSet::default();
    let mut deduped: Vec<&CalldataParam> = group
        .params
        .iter()
        .filter(|p| seen.insert(p.index))
        .collect();
    deduped.sort_by_key(|p| p.index);

    deduped
        .iter()
        .enumerate()
        .map(|(i, _p)| {
            let ty = type_list.get(i).cloned().unwrap_or(EvmType::Unknown);
            let ty_name = ty.solidity_name();
            let param_name = match &ty {
                EvmType::Address => format!("addr{i}"),
                EvmType::Uint(_) => format!("amount{i}"),
                EvmType::Bool => format!("flag{i}"),
                _ => format!("param{i}"),
            };
            ParamOut {
                name: param_name,
                ty: ty_name,
            }
        })
        .collect()
}

fn reconstruct_returns(group: &FnGroup, results: &FxHashMap<usize, BlockResult>) -> Vec<ParamOut> {
    let mut recovered = rustc_hash::FxHashSet::default();
    for block_id in &group.block_ids {
        if let Some(result) = results.get(block_id) {
            for statement in &result.stmts {
                if let Stmt::Return { value } = statement {
                    recovered.insert(value.clone());
                }
            }
        }
    }
    let mut values: Vec<String> = recovered.into_iter().collect();
    values.sort();
    values
        .into_iter()
        .enumerate()
        .map(|(index, value)| ParamOut {
            name: format!("return{index}"),
            ty: if value.contains("bool") || value == "0" || value == "1" {
                "bool".into()
            } else {
                "uint256".into()
            },
        })
        .collect()
}

fn is_view_fn(group: &FnGroup, results: &FxHashMap<usize, BlockResult>) -> bool {
    !group.block_ids.iter().any(|bid| {
        results
            .get(bid)
            .map(|r| {
                r.stmts.iter().any(|s| {
                    matches!(
                        s,
                        Stmt::SStore { .. } | Stmt::Call { .. } | Stmt::DelegateCall { .. }
                    )
                })
            })
            .unwrap_or(false)
    })
}

pub fn decompile(
    disasm: &Disassembly,
    cfg: &CFG,
    sigs: &SignatureReport,
    private_candidates: &[PrivateFunctionCandidate],
    options: &AnalysisOptions,
) -> DecompiledOutput {
    let mut exec = SymExec::with_visit_limit(disasm, cfg, options.max_block_visits);
    let results = exec.run();
    let symbolic_stats = exec.stats();
    let type_ctx = exec.type_ctx();

    let groups = lift_functions(cfg, sigs, &results, private_candidates);
    let storage_vars = type_ctx.to_storage_vars();

    let mut functions: Vec<DecompiledFn> = Vec::new();
    for group in &groups {
        let params = reconstruct_params(group);
        let returns = reconstruct_returns(group, &results);
        let view_flag = is_view_fn(group, &results);
        let body = structurize(&group.block_ids, &results, cfg, 2);

        functions.push(DecompiledFn {
            selector: group.selector.clone(),
            name: group.name.clone(),
            params,
            returns,
            body,
            is_view: view_flag,
            is_payable: group.is_payable,
            start_block: group.entry_block,
            block_ids: group.block_ids.clone(),
            is_private_candidate: group.is_private_candidate,
            confidence: group.confidence,
        });
    }

    let source = emit_solidity(&functions, &storage_vars, sigs);
    let total_params = functions.iter().map(|f| f.params.len()).sum();
    let storage_out = storage_vars
        .iter()
        .map(|v| StorageSlotOut {
            slot: v.slot,
            name: v.name.clone(),
            ty: v.ty.solidity_name(),
            reads: v.reads,
            writes: v.writes,
        })
        .collect();
    let mapping_candidates = type_ctx
        .mapping_candidates()
        .iter()
        .map(|candidate| MappingOut {
            expression: candidate.expression.clone(),
            reads: candidate.reads,
            writes: candidate.writes,
            confidence: candidate.confidence,
        })
        .collect();

    DecompiledOutput {
        pseudo_source: source,
        functions,
        storage_slots: storage_out,
        mapping_candidates,
        symbolic_stats,
        total_params,
    }
}

fn emit_solidity(
    fns: &[DecompiledFn],
    storage_vars: &[StorageVar],
    sigs: &SignatureReport,
) -> String {
    let mut s = String::with_capacity(8192);

    s.push_str("// ╔══════════════════════════════════════════════════════════╗\n");
    s.push_str("// ║     HINSDALE DECOMPILER — PSEUDO-SOLIDITY OUTPUT v2      ║\n");
    s.push_str("// ║  Inter-block symbolic execution + constant folding        ║\n");
    s.push_str("// ║  WARNING: Reconstructed — verify before use.             ║\n");
    s.push_str("// ╚══════════════════════════════════════════════════════════╝\n\n");
    s.push_str("// SPDX-License-Identifier: UNLICENSED\n");
    s.push_str("pragma solidity ^0.8.0;\n\n");

    // Known interfaces
    let has_erc20 = sigs.functions.iter().any(|f| {
        matches!(
            f.selector.as_str(),
            "0x095ea7b3" | "0x70a08231" | "0xa9059cbb" | "0x23b872dd"
        )
    });
    if has_erc20 {
        s.push_str("interface IERC20 {\n");
        s.push_str("    function transfer(address to, uint256 amount) external returns (bool);\n");
        s.push_str(
            "    function approve(address spender, uint256 amount) external returns (bool);\n",
        );
        s.push_str("    function balanceOf(address account) external view returns (uint256);\n");
        s.push_str("    function transferFrom(address from, address to, uint256 amount) external returns (bool);\n");
        s.push_str("}\n\n");
    }
    let has_flash = sigs.functions.iter().any(|f| f.selector == "0x42b0b77c");
    if has_flash {
        s.push_str("interface IPool {\n");
        s.push_str("    function flashLoanSimple(\n");
        s.push_str("        address receiverAddress,\n");
        s.push_str("        address asset,\n");
        s.push_str("        uint256 amount,\n");
        s.push_str("        bytes calldata params,\n");
        s.push_str("        uint16 referralCode\n");
        s.push_str("    ) external;\n");
        s.push_str("}\n\n");
    }

    s.push_str("contract Decompiled {\n\n");

    // Storage
    if !storage_vars.is_empty() {
        s.push_str("    // ── Storage Layout (recovered) ───────────────────────────\n");
        for v in storage_vars {
            s.push_str(&format!(
                "    {} public {}; // slot 0x{:x} | r:{} w:{}\n",
                v.ty.solidity_name(),
                v.name,
                v.slot,
                v.reads,
                v.writes
            ));
        }
        s.push('\n');
    }

    // ABI event and custom-error evidence. Unknown values remain comments so
    // pseudo-source never invents a Solidity declaration from a raw hash.
    if !sigs.abi_events.is_empty() {
        s.push_str("    // ── Events (ABI evidence from LOG instructions) ───────────\n");
        for event in &sigs.abi_events {
            let label = event
                .known_signature
                .as_deref()
                .unwrap_or("unknown event topic");
            let offsets = event
                .evidence
                .iter()
                .map(|evidence| format!("0x{:x}", evidence.log_offset))
                .collect::<Vec<_>>()
                .join(", ");
            s.push_str(&format!(
                "    // event {label}; topic: {} | LOG offsets: {offsets} | confidence {:.2}\n",
                event.topic0.as_deref().unwrap_or("<anonymous>"),
                event.confidence
            ));
        }
        s.push('\n');
    }
    if !sigs.custom_errors.is_empty() {
        s.push_str("    // ── Errors (ABI evidence from REVERT instructions) ────────\n");
        for error in &sigs.custom_errors {
            let label = error
                .known_signature
                .as_deref()
                .unwrap_or(error.name.as_str());
            let offsets = error
                .evidence
                .iter()
                .map(|evidence| format!("0x{:x}", evidence.revert_offset))
                .collect::<Vec<_>>()
                .join(", ");
            s.push_str(&format!(
                "    // error {label}; selector: {} | REVERT offsets: {offsets} | confidence {:.2}\n",
                error.selector, error.confidence
            ));
        }
        s.push('\n');
    }

    // Functions
    for f in fns {
        if f.name == "fallback" && f.body.is_empty() {
            continue;
        }

        let sel = f
            .selector
            .as_deref()
            .map(|s| format!("  // {s}"))
            .unwrap_or_default();
        let mutability = if f.is_view {
            " view"
        } else if f.is_payable {
            " payable"
        } else {
            ""
        };
        let visibility = if f.name == "fallback" || f.is_private_candidate {
            "internal"
        } else {
            "external"
        };
        let params_str = f
            .params
            .iter()
            .map(|p| format!("{} {}", p.ty, p.name))
            .collect::<Vec<_>>()
            .join(", ");
        let returns_str = if f.returns.is_empty() {
            String::new()
        } else {
            format!(
                " returns ({})",
                f.returns
                    .iter()
                    .map(|value| value.ty.clone())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        };
        let confidence = if f.is_private_candidate {
            format!("  // private candidate confidence {:.2}", f.confidence)
        } else {
            String::new()
        };

        s.push_str(&format!(
            "    function {}({}) {}{}{}{}{} {{\n",
            f.name, params_str, visibility, mutability, returns_str, sel, confidence
        ));

        let body: Vec<&str> = f
            .body
            .iter()
            .map(|l| l.as_str())
            .filter(|l| !l.trim().is_empty())
            .collect();
        if body.is_empty() {
            s.push_str("        // (no meaningful statements recovered)\n");
        } else {
            for line in body {
                s.push_str(line);
                s.push('\n');
            }
        }

        s.push_str("    }\n\n");
    }

    s.push_str("}\n");
    s
}
