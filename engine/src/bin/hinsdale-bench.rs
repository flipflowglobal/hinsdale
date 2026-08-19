use hinsdale::analysis::{AnalysisOptions, QualityTier, JSON_SCHEMA_VERSION};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
struct Manifest {
    corpus_version: String,
    fixtures: Vec<Fixture>,
}

#[derive(Debug, Deserialize)]
struct Fixture {
    id: String,
    path: String,
    source: String,
    expected: Expected,
}

#[derive(Debug, Deserialize)]
struct Expected {
    has_delegatecall: bool,
    minimum_resolved_jumps: usize,
}

#[derive(Debug, Serialize)]
struct FixtureMetric {
    id: String,
    source: String,
    bytes: usize,
    blocks: usize,
    cfg_edges: usize,
    resolved_jumps: usize,
    unresolved_jumps: usize,
    public_functions: usize,
    private_function_candidates: usize,
    event_topics: usize,
    mapping_candidates: usize,
    elapsed_ms: f64,
    passed_expectations: bool,
}

#[derive(Debug, Serialize)]
struct BenchmarkReport {
    schema_version: String,
    corpus_version: String,
    quality_tier: QualityTier,
    fixtures: Vec<FixtureMetric>,
}

fn parse_tier(args: &[String]) -> QualityTier {
    args.windows(2)
        .find(|pair| pair[0] == "--tier")
        .and_then(|pair| QualityTier::from_str(&pair[1]))
        .unwrap_or(QualityTier::Precise)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let manifest_path = args
        .windows(2)
        .find(|pair| pair[0] == "--manifest")
        .map(|pair| PathBuf::from(&pair[1]))
        .unwrap_or_else(|| PathBuf::from("benchmarks/corpus/manifest.json"));
    let tier = parse_tier(&args);
    let content = std::fs::read_to_string(&manifest_path).expect("read benchmark manifest");
    let manifest: Manifest = serde_json::from_str(&content).expect("parse benchmark manifest");
    let base = manifest_path.parent().unwrap_or_else(|| Path::new("."));

    let fixtures = manifest
        .fixtures
        .into_iter()
        .map(|fixture| {
            let raw =
                std::fs::read_to_string(base.join(&fixture.path)).expect("read fixture bytecode");
            let bytecode =
                hinsdale::parse_hex(&raw).expect("fixture must contain valid hexadecimal bytecode");
            let report = hinsdale::analyze_with_options(&bytecode, AnalysisOptions::for_tier(tier));
            let passed_expectations = report.security.has_delegatecall
                == fixture.expected.has_delegatecall
                && report.cfg_summary.resolved_jump_count
                    >= fixture.expected.minimum_resolved_jumps;
            FixtureMetric {
                id: fixture.id,
                source: fixture.source,
                bytes: report.metadata.bytecode_len,
                blocks: report.cfg_summary.block_count,
                cfg_edges: report.cfg_summary.edge_count,
                resolved_jumps: report.cfg_summary.resolved_jump_count,
                unresolved_jumps: report.cfg_summary.unresolved_jump_count,
                public_functions: report.signatures.functions.len(),
                private_function_candidates: report.private_functions.len(),
                event_topics: report.signatures.events.len(),
                mapping_candidates: report.decompiled.mapping_candidates.len(),
                elapsed_ms: report.elapsed_ms,
                passed_expectations,
            }
        })
        .collect();

    println!(
        "{}",
        serde_json::to_string_pretty(&BenchmarkReport {
            schema_version: JSON_SCHEMA_VERSION.into(),
            corpus_version: manifest.corpus_version,
            quality_tier: tier,
            fixtures,
        })
        .expect("serialize benchmark report")
    );
}
