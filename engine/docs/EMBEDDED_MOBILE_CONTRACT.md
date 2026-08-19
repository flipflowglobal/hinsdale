# Embedded Mobile Engine Contract

## Delivery Model

Hinsdale is packaged with the mobile application as a Rust static library. Android loads `libhinsdale_engine.so` through JNI; iOS links `HinsdaleEngine.xcframework` through a Swift Expo Module. The JavaScript application calls a single asynchronous native API and never reconstructs selectors, security findings, or source code itself.

The engine is intentionally unavailable in Expo Go and the web build. Those environments do not load the application’s custom native libraries. The UI must return an explicit `HINSDALE_NATIVE_ENGINE_UNAVAILABLE` state; it must not substitute a heuristic or precomputed report.

## Stable Native API

| Field | Contract |
|---|---|
| `schema_version` | Must equal `hinsdale.report/v2` before a report is accepted by the application. |
| `bytecode_hex` | Hexadecimal runtime or creation bytecode with an optional `0x` prefix, capped at 512 KiB after decoding. |
| `quality_tier` | Exactly `fast`, `precise`, or `research`; each maps to Rust `AnalysisOptions`. |
| `analysis_mode` | Controls which sections the application renders, not what the engine fabricates or omits. |
| result payload | UTF-8 JSON created by Rust `serde_json`; all findings and pseudo-source come from the embedded engine. |
| errors | Typed codes: `INVALID_INPUT`, `INPUT_TOO_LARGE`, `ENGINE_FAILURE`, `SCHEMA_MISMATCH`, and `NATIVE_ENGINE_UNAVAILABLE`. |

## Resource Limits

The native bridge rejects decoded bytecode exceeding 512 KiB. The Rust engine receives a profile-bounded block-visit count. Native bindings perform execution away from the UI thread and return a JSON string only after the report is complete. Callers must render a cancellable loading state and should not persist reports that fail schema validation.

## Platform Support Matrix

| Platform | Packaging | Runtime status |
|---|---|---|
| Android | `arm64-v8a` and `armeabi-v7a` shared libraries assembled with the NDK; Kotlin JNI Expo Module | Supported in a custom development client or release build. |
| iOS | `HinsdaleEngine.xcframework` for device and simulator; Swift Expo Module | Supported in a custom development client or release build. |
| Expo Go | Does not include custom native modules | Explicitly unavailable. |
| Web | Does not load Android/iOS native libraries | Explicitly unavailable. |

## Audit Findings Resolved by This Contract

The former TypeScript `buildAnalysisReport` path, selector table, opcode counting, pseudo-Solidity generator, static benchmark display, and “Use example” control are demo-only behavior. They are removed from production flows. The system retains validation and display formatting in TypeScript, but all analysis content originates from Rust.
