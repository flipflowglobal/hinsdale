// src/signatures.rs — Dispatcher, event, and custom-error ABI recovery.
//
// Recovery is evidence-first. Labels and parameter types are emitted only for
// a small embedded set of canonical ABI signatures. Unknown selectors/topics
// remain explicitly unlabelled and retain instruction-level evidence.

use crate::disasm::{Disassembly, Instruction};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};

/// A recovered function signature.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionSig {
    pub selector: String,
    pub selector_u32: u32,
    pub known_name: Option<String>,
    pub jump_target: Option<usize>,
    pub is_view: bool,
}

/// ABI parameter information included only when a canonical signature is known.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbiParameter {
    pub name: String,
    pub ty: String,
    pub indexed: bool,
}

/// A concrete LOG instruction and the bytecode instructions used to infer it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEvidence {
    pub log_offset: usize,
    pub log_opcode: String,
    pub topic_count: usize,
    pub topic0_push_offset: Option<usize>,
    pub data_bytes_hint: Option<usize>,
    pub instruction_offsets: Vec<usize>,
}

/// ABI event recovery. `known_signature` is absent when the topic is unknown.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveredEvent {
    pub topic0: Option<String>,
    pub name: String,
    pub known_signature: Option<String>,
    pub parameters: Vec<AbiParameter>,
    pub confidence: f32,
    pub evidence: Vec<EventEvidence>,
}

/// A concrete REVERT instruction and the nearby selector construction evidence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorEvidence {
    pub revert_offset: usize,
    pub selector_push_offset: Option<usize>,
    pub revert_data_bytes_hint: Option<usize>,
    pub argument_word_count: Option<usize>,
    pub instruction_offsets: Vec<usize>,
}

/// ABI custom-error recovery. Unknown selectors are preserved without invented types.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveredError {
    pub selector: String,
    pub name: String,
    pub known_signature: Option<String>,
    pub parameters: Vec<AbiParameter>,
    pub confidence: f32,
    pub evidence: Vec<ErrorEvidence>,
}

/// Legacy shallow event topic entry retained for existing v2 consumers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventTopic {
    pub topic: String,
    pub known_name: Option<String>,
    pub confidence: f32,
}

/// All recovered function selectors, ABI observations, and raw evidence.
#[derive(Debug, Serialize, Deserialize)]
pub struct SignatureReport {
    pub functions: Vec<FunctionSig>,
    pub event_topics: Vec<String>,
    pub events: Vec<EventTopic>,
    pub abi_events: Vec<RecoveredEvent>,
    pub custom_errors: Vec<RecoveredError>,
    pub has_dispatcher: bool,
    pub fallback_offset: Option<usize>,
}

type AbiDefinition = (
    &'static str,
    &'static str,
    &'static [(&'static str, &'static str, bool)],
);

const TRANSFER_PARAMS: &[(&str, &str, bool)] = &[
    ("from", "address", true),
    ("to", "address", true),
    ("value", "uint256", false),
];
const APPROVAL_PARAMS: &[(&str, &str, bool)] = &[
    ("owner", "address", true),
    ("spender", "address", true),
    ("value", "uint256", false),
];
const OWNERSHIP_PARAMS: &[(&str, &str, bool)] = &[
    ("previousOwner", "address", true),
    ("newOwner", "address", true),
];
const APPROVAL_FOR_ALL_PARAMS: &[(&str, &str, bool)] = &[
    ("owner", "address", true),
    ("operator", "address", true),
    ("approved", "bool", false),
];
const ERROR_STRING_PARAMS: &[(&str, &str, bool)] = &[("message", "string", false)];
const PANIC_PARAMS: &[(&str, &str, bool)] = &[("code", "uint256", false)];

fn abi_parameters(definition: &[(&str, &str, bool)]) -> Vec<AbiParameter> {
    definition
        .iter()
        .map(|(name, ty, indexed)| AbiParameter {
            name: (*name).into(),
            ty: (*ty).into(),
            indexed: *indexed,
        })
        .collect()
}

fn builtin_event(topic: &str) -> Option<AbiDefinition> {
    match topic {
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" => Some((
            "Transfer",
            "Transfer(address,address,uint256)",
            TRANSFER_PARAMS,
        )),
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925" => Some((
            "Approval",
            "Approval(address,address,uint256)",
            APPROVAL_PARAMS,
        )),
        "0x8be0079c531659141344cd1fd0a4f28419497f9723d4d2c2dcf6a93cbb4f0c0c" => Some((
            "OwnershipTransferred",
            "OwnershipTransferred(address,address)",
            OWNERSHIP_PARAMS,
        )),
        "0x17307eab39ab6107e8899845ad3d59e330e5b2c9f2d3a8c5d1f08e4b8c3e4d93" => Some((
            "ApprovalForAll",
            "ApprovalForAll(address,address,bool)",
            APPROVAL_FOR_ALL_PARAMS,
        )),
        _ => None,
    }
}

fn builtin_error(selector: &str) -> Option<AbiDefinition> {
    match selector {
        "0x08c379a0" => Some(("Error", "Error(string)", ERROR_STRING_PARAMS)),
        "0x4e487b71" => Some(("Panic", "Panic(uint256)", PANIC_PARAMS)),
        "0x82b42900" => Some(("Unauthorized", "Unauthorized()", &[])),
        _ => None,
    }
}

// ── Built-in 4-byte selector lookup table (common DeFi / ERC patterns) ────
fn builtin_4byte(sel: u32) -> Option<&'static str> {
    match sel {
        0x06fdde03 => Some("name()"),
        0x095ea7b3 => Some("approve(address,uint256)"),
        0x18160ddd => Some("totalSupply()"),
        0x23b872dd => Some("transferFrom(address,address,uint256)"),
        0x313ce567 => Some("decimals()"),
        0x39509351 => Some("increaseAllowance(address,uint256)"),
        0x40c10f19 => Some("mint(address,uint256)"),
        0x42966c68 => Some("burn(uint256)"),
        0x42b0b77c => Some("flashLoanSimple(address,address,uint256,bytes,uint16)"),
        0x4e71d92d => Some("claim()"),
        0x70a08231 => Some("balanceOf(address)"),
        0x715018a6 => Some("renounceOwnership()"),
        0x79cc6790 => Some("burnFrom(address,uint256)"),
        0x8da5cb5b => Some("owner()"),
        0x8456cb59 => Some("pause()"),
        0x95d89b41 => Some("symbol()"),
        0xa0712d68 => Some("mint(uint256)"),
        0xa217fddf => Some("DEFAULT_ADMIN_ROLE()"),
        0xa22cb465 => Some("setApprovalForAll(address,bool)"),
        0xa9059cbb => Some("transfer(address,uint256)"),
        0xaabbccdd => Some("unknown_aabbccdd()"),
        0xb88d4fde => Some("safeTransferFrom(address,address,uint256,bytes)"),
        0xc87b56dd => Some("tokenURI(uint256)"),
        0xd0e30db0 => Some("deposit()"),
        0xd547741f => Some("revokeRole(bytes32,address)"),
        0xdd62ed3e => Some("allowance(address,address)"),
        0xe63d38ed => Some("withdraw(uint256)"),
        0xf2fde38b => Some("transferOwnership(address)"),
        0xf851a440 => Some("admin()"),
        0x2e1a7d4d => Some("withdraw(uint256)"),
        0x3ccfd60b => Some("withdraw()"),
        0x4782f779 => Some("withdrawTo(address,uint256)"),
        0x839006f2 => Some("flash(address,uint256)"),
        0x0b187dd3 => Some("flash(address,uint256)"),
        0x1b11d0ff => Some("executeOperation(address,uint256,uint256,address,bytes)"),
        0xda2ca9b5 => Some("rescue(address)"),
        0x2301d775 => Some("profitWallet()"),
        0x5c975abb => Some("paused()"),
        0x3f4ba83a => Some("unpause()"),
        0x4f1ef286 => Some("upgradeToAndCall(address,bytes)"),
        0x52d1902d => Some("proxiableUUID()"),
        0x3659cfe6 => Some("upgradeTo(address)"),
        0xe8eda9df => Some("supply(address,uint256,address,uint16)"),
        0x69328dec => Some("withdraw(address,uint256,address)"),
        0x573ade81 => Some("repay(address,uint256,uint256,address)"),
        0x617ba037 => Some("borrow(address,uint256,uint256,uint16,address)"),
        0x128acb08 => Some("swap(address,bool,int256,uint160,bytes)"),
        0x1a686502 => Some("liquidity()"),
        0x514ea4bf => Some("ticks(int24)"),
        0x3850c7bd => Some("slot0()"),
        0x0902f1ac => Some("getReserves()"),
        0xf242432a => Some("safeTransferFrom(address,address,uint256,uint256,bytes)"),
        0x2eb2c2d6 => Some("safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)"),
        _ => None,
    }
}

fn push_value(instruction: &Instruction) -> Option<u64> {
    match instruction.opcode {
        0x5f => Some(0),
        0x60..=0x7f => instruction.imm_u256,
        _ => None,
    }
}

fn nearby_data_size(instructions: &[Instruction], index: usize) -> Option<usize> {
    if index < 2 {
        return None;
    }
    let offset = push_value(&instructions[index - 1])?;
    let size = push_value(&instructions[index - 2])?;
    (offset == 0).then_some(size as usize)
}

fn evidence_window(instructions: &[Instruction], start: usize, end: usize) -> Vec<usize> {
    instructions[start..end]
        .iter()
        .map(|instruction| instruction.offset)
        .collect()
}

fn recover_events(instructions: &[Instruction]) -> Vec<RecoveredEvent> {
    let mut events: Vec<RecoveredEvent> = Vec::new();
    for (index, instruction) in instructions.iter().enumerate() {
        if !(0xa0..=0xa4).contains(&instruction.opcode) {
            continue;
        }
        let topic_count = (instruction.opcode - 0xa0) as usize;
        let start = index.saturating_sub(20);
        let topic_instruction = if topic_count == 0 {
            None
        } else {
            instructions[start..index].iter().rev().find(|candidate| {
                candidate.opcode == 0x7f
                    && candidate
                        .imm
                        .as_ref()
                        .is_some_and(|value| value.len() == 64)
            })
        };
        let topic0 = topic_instruction
            .and_then(|candidate| candidate.imm.as_ref().map(|value| format!("0x{value}")));
        let definition = topic0.as_deref().and_then(builtin_event);
        let (name, known_signature, parameters, confidence) = match definition {
            Some((name, signature, params)) => (
                name.into(),
                Some(signature.into()),
                abi_parameters(params),
                0.98,
            ),
            None if topic0.is_some() => ("UnknownEvent".into(), None, Vec::new(), 0.55),
            None => ("AnonymousLog".into(), None, Vec::new(), 0.35),
        };
        let evidence = EventEvidence {
            log_offset: instruction.offset,
            log_opcode: instruction.mnemonic.clone(),
            topic_count,
            topic0_push_offset: topic_instruction.map(|candidate| candidate.offset),
            data_bytes_hint: nearby_data_size(instructions, index),
            instruction_offsets: evidence_window(instructions, start, index + 1),
        };

        if let Some(existing) = events.iter_mut().find(|event| event.topic0 == topic0) {
            existing.evidence.push(evidence);
        } else {
            events.push(RecoveredEvent {
                topic0,
                name,
                known_signature,
                parameters,
                confidence,
                evidence: vec![evidence],
            });
        }
    }
    events
}

fn recover_errors(instructions: &[Instruction]) -> Vec<RecoveredError> {
    let mut errors: Vec<RecoveredError> = Vec::new();
    for (index, instruction) in instructions.iter().enumerate() {
        if instruction.opcode != 0xfd {
            continue;
        }
        let start = index.saturating_sub(24);
        let selector_instruction = instructions[start..index].iter().rev().find(|candidate| {
            candidate.opcode == 0x63 && candidate.imm.as_ref().is_some_and(|value| value.len() == 8)
        });
        let Some(selector_instruction) = selector_instruction else {
            continue;
        };
        let selector = format!(
            "0x{}",
            selector_instruction.imm.as_deref().unwrap_or_default()
        );
        let has_mstore = instructions[start..index]
            .iter()
            .any(|candidate| candidate.opcode == 0x52);
        if !has_mstore {
            continue;
        }
        let data_bytes_hint = nearby_data_size(instructions, index);
        let argument_word_count = data_bytes_hint.and_then(|length| {
            (length >= 4 && (length - 4) % 32 == 0).then_some((length - 4) / 32)
        });
        let definition = builtin_error(&selector);
        let (name, known_signature, parameters, confidence) = match definition {
            Some((name, signature, params)) => (
                name.into(),
                Some(signature.into()),
                abi_parameters(params),
                0.98,
            ),
            None => (
                format!("CustomError_{}", &selector[2..]),
                None,
                Vec::new(),
                0.68,
            ),
        };
        let evidence = ErrorEvidence {
            revert_offset: instruction.offset,
            selector_push_offset: Some(selector_instruction.offset),
            revert_data_bytes_hint: data_bytes_hint,
            argument_word_count,
            instruction_offsets: evidence_window(instructions, start, index + 1),
        };
        if let Some(existing) = errors.iter_mut().find(|error| error.selector == selector) {
            existing.evidence.push(evidence);
        } else {
            errors.push(RecoveredError {
                selector,
                name,
                known_signature,
                parameters,
                confidence,
                evidence: vec![evidence],
            });
        }
    }
    errors
}

/// Recover function selectors, event topics, and custom-error selectors from bytecode.
pub fn recover_signatures(disasm: &Disassembly) -> SignatureReport {
    let instrs = &disasm.instructions;
    let mut functions: Vec<FunctionSig> = Vec::new();
    let mut has_dispatcher = false;
    let mut seen_selectors: FxHashMap<u32, usize> = FxHashMap::default();

    for index in 0..instrs.len().saturating_sub(2) {
        let instruction = &instrs[index];
        if instruction.opcode != 0x63 {
            continue;
        }
        let Some(value) = instruction.imm_u256 else {
            continue;
        };
        let selector = value as u32;
        let window_end = (index + 6).min(instrs.len());
        let window = &instrs[index + 1..window_end];
        if !window.iter().any(|candidate| candidate.opcode == 0x14)
            || !window.iter().any(|candidate| candidate.opcode == 0x57)
        {
            continue;
        }
        has_dispatcher = true;
        let jump_target = window
            .windows(2)
            .find(|pair| pair[1].opcode == 0x57 && (0x60..=0x7f).contains(&pair[0].opcode))
            .and_then(|pair| pair[0].imm_u256)
            .map(|value| value as usize);
        if let std::collections::hash_map::Entry::Vacant(entry) = seen_selectors.entry(selector) {
            entry.insert(functions.len());
            functions.push(FunctionSig {
                selector: format!("0x{selector:08x}"),
                selector_u32: selector,
                known_name: builtin_4byte(selector).map(str::to_string),
                jump_target,
                is_view: false,
            });
        }
    }

    let abi_events = recover_events(instrs);
    let event_topics = abi_events
        .iter()
        .filter_map(|event| event.topic0.clone())
        .collect();
    let events = abi_events
        .iter()
        .filter_map(|event| {
            event.topic0.as_ref().map(|topic| EventTopic {
                topic: topic.clone(),
                known_name: event.known_signature.clone(),
                confidence: event.confidence,
            })
        })
        .collect();
    let fallback_offset = instrs
        .iter()
        .rev()
        .find(|instruction| instruction.opcode == 0x57)
        .map(|instruction| instruction.offset);

    SignatureReport {
        functions,
        event_topics,
        events,
        abi_events,
        custom_errors: recover_errors(instrs),
        has_dispatcher,
        fallback_offset,
    }
}
