use crate::cfg::{CfgEdgeKind, CFG};
use crate::signatures::SignatureReport;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateFunctionCandidate {
    pub entry_block: usize,
    pub entry_offset: usize,
    pub caller_blocks: Vec<usize>,
    pub body_blocks: Vec<usize>,
    pub confidence: f32,
    pub evidence: Vec<String>,
}

fn public_entries(cfg: &CFG, signatures: &SignatureReport) -> FxHashSet<usize> {
    let offsets: FxHashMap<usize, usize> = cfg.offset_to_block.iter().copied().collect();
    signatures
        .functions
        .iter()
        .filter_map(|signature| {
            signature
                .jump_target
                .and_then(|offset| offsets.get(&offset).copied())
        })
        .collect()
}

fn bounded_body(cfg: &CFG, entry: usize, public: &FxHashSet<usize>) -> Vec<usize> {
    let mut body = FxHashSet::default();
    let mut queue = VecDeque::from([entry]);
    while let Some(block) = queue.pop_front() {
        if !body.insert(block) || body.len() >= 32 {
            continue;
        }
        for successor in &cfg.blocks[block].successors {
            if *successor != entry && public.contains(successor) {
                continue;
            }
            queue.push_back(*successor);
        }
    }
    let mut blocks: Vec<_> = body.into_iter().collect();
    blocks.sort_unstable();
    blocks
}

/// Recover bounded internal-call candidates from statically resolved, non-dispatch jumps.
/// The result is intentionally evidence-bearing: EVM has no native CALL/RET instruction pair,
/// so callers must not treat these candidates as confirmed source-level functions.
pub fn recover_private_functions(
    cfg: &CFG,
    signatures: &SignatureReport,
) -> Vec<PrivateFunctionCandidate> {
    let public = public_entries(cfg, signatures);
    let mut callers: FxHashMap<usize, Vec<usize>> = FxHashMap::default();

    for edge in &cfg.control.edges {
        let Some(target) = edge.to else {
            continue;
        };
        if !matches!(edge.kind, CfgEdgeKind::StaticJump) || public.contains(&target) || target == 0
        {
            continue;
        }
        callers.entry(target).or_default().push(edge.from);
    }

    let mut candidates: Vec<_> = callers
        .into_iter()
        .filter_map(|(entry_block, mut caller_blocks)| {
            let block = cfg.blocks.get(entry_block)?;
            caller_blocks.sort_unstable();
            caller_blocks.dedup();
            let body_blocks = bounded_body(cfg, entry_block, &public);
            let shared_callers = caller_blocks.len() > 1;
            let confidence = if shared_callers {
                0.62
            } else if body_blocks.len() > 1 {
                0.46
            } else {
                0.32
            };
            let mut evidence = vec!["static non-dispatch JUMP into JUMPDEST-like block".into()];
            if shared_callers {
                evidence.push("entry is reached by multiple static callers".into());
            }
            if body_blocks.len() >= 32 {
                evidence.push("body truncated at analysis boundary".into());
            }
            Some(PrivateFunctionCandidate {
                entry_block,
                entry_offset: block.start_offset,
                caller_blocks,
                body_blocks,
                confidence,
                evidence,
            })
        })
        .collect();

    candidates.sort_by_key(|candidate| candidate.entry_block);
    candidates
}
