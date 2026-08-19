use hinsdale::analysis::{AnalysisOptions, QualityTier, JSON_SCHEMA_VERSION};

const EIP1167_RUNTIME_PROXY: &str =
    "363d3d373d3d3d363d7300000000000000000000000000000000000000005af43d82803e903d91602b57fd5bf3";

#[test]
fn precise_profile_reports_schema_and_capability_contract() {
    let bytecode = hinsdale::parse_hex(EIP1167_RUNTIME_PROXY).expect("valid EIP-1167 fixture");
    let report =
        hinsdale::analyze_with_options(&bytecode, AnalysisOptions::for_tier(QualityTier::Precise));

    assert_eq!(report.schema_version, JSON_SCHEMA_VERSION);
    assert_eq!(report.metadata.analysis_profile, "precise");
    assert!(report.capabilities.cfg_context);
    assert!(report.capabilities.private_function_candidates);
    assert!(report.cfg_summary.resolved_jump_count >= 1);
    assert!(report.security.has_delegatecall);
}

#[test]
fn research_profile_exposes_bounded_exploration_contract() {
    let bytecode = hinsdale::parse_hex(EIP1167_RUNTIME_PROXY).expect("valid EIP-1167 fixture");
    let report =
        hinsdale::analyze_with_options(&bytecode, AnalysisOptions::for_tier(QualityTier::Research));

    assert_eq!(report.metadata.analysis_profile, "research");
    assert!(report.capabilities.bounded_path_exploration);
    assert!(report.decompiled.symbolic_stats.executed_blocks > 0);
}
