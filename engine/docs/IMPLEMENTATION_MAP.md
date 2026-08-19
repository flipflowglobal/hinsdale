# Hinsdale Engine Implementation Map

## Purpose

This document translates the requested A–D roadmap into the implementation increments contained in this workspace. The work is intentionally staged: each increment establishes a stable, testable contract before it claims full decompilation certainty. A recovered edge, function, type, or control structure is therefore accompanied by a confidence or evidence category rather than being represented as ground truth.

| Branch | Delivered foundation | Acceptance criterion | Remaining hard problem |
|---|---|---|---|
| A1 | CFG edge evidence, context labels, loop and join summaries, improved stack-local static jump resolution | Every resolved jump records direct or propagated evidence; unresolved jumps remain explicit | Interprocedural points-to analysis and complete dynamic-jump recovery |
| A2 | Private-function candidate report using non-dispatch static jump entries, caller sets, and bounded bodies | Candidate boundaries are separate from public selector functions and carry confidence | Full EVM internal-call convention recovery across compiler families |
| A3 | Per-function parameter and return observations plus merged symbolic stack inputs | Pseudo-functions expose recovered parameters and return evidence | Fully path-sensitive ABI and return typing |
| A4 | Cross-block memory state, phi-style merged stack values, and SSA-style variable provenance counters | Merge points preserve divergent values rather than discarding later paths | Alias-complete memory and storage reasoning |
| A5 | CFG loop and switch-like summaries supplied to structurization | Pseudo-source labels recovered loop/back-edge and multi-way dispatch evidence | General reducible/irreducible region reconstruction |
| B1 | Constant-folding and propagated type evidence are surfaced in symbolic output | Constant expressions and recognized casts retain typed evidence | Full 256-bit algebraic simplification |
| B2 | Direct-slot plus keccak-pattern mapping candidates | Mapping-like storage accesses appear in the storage report | Layout reconstruction across inherited and packed storage |
| B3 | Known event-topic labels and printable error-word recovery | Recognized topics and decoded words are shown with raw evidence | Full ABI event/error reconstruction |
| B4 | Bounded merged-state exploration with explicit limits | Path processing limits and merge statistics are reported | Exhaustive solver-backed exploration |
| C1–C5 | Local reproducible corpus format, metrics runner, baseline/differential adapters, CI workflow, and adversarial fixtures | The harness runs without network access and emits stable JSON metrics | Curated large-scale verified-contract corpus and external runner provisioning |
| D1–D4 | Versioned JSON report field, execution profiles, limitation statement, Docker build, and reproducible commands | CLI exposes profile/schema controls and container build validates | Published images and compatibility guarantees across releases |

## Quality-Tier Contract

| Tier | Execution contract | User-visible confidence language |
|---|---|---|
| **Fast** | Linear disassembly, basic CFG, selector recovery, security indicators, and bounded symbolic lifting | Useful for triage; unresolved control flow remains explicit. |
| **Precise** | Enables enhanced CFG context, function candidates, state merging, storage/event inference, and richer structure summaries | Higher-effort reconstruction; still requires verification. |
| **Research** | Increases exploration budget and emits experimental observations while preserving hard limits | Investigative output, not a security guarantee. |

## Evaluation Contract

The benchmark harness reports bytecode length, blocks, CFG edges, resolved and unresolved jumps, recovered public and private functions, events, mapping candidates, elapsed time, and failure status. Optional differential runners accept saved JSON from other tools rather than downloading or executing third-party binaries automatically. This makes results reproducible in constrained environments and keeps external comparison provenance visible.

## Limitation Statement

Hinsdale output is reconstructed analysis. It does not prove equivalence to source code, the absence of vulnerabilities, or correctness of inferred interfaces. Any result affecting deployment, auditing, or asset custody requires independent verification by qualified reviewers.
