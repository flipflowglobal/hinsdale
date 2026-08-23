# Embedded Engine and Differential Evaluation Contract

## Embedded-Only Execution Policy

The Rust engine is packaged with the application and is the **only** production analysis path. The mobile client calls the Android JNI or iOS Swift binding, validates the versioned response, and persists the report only after schema checks pass. It does not send bytecode to a remote endpoint, download analysis code, or substitute JavaScript heuristics when the native module is unavailable.

| Concern | Required contract |
|---|---|
| Execution | `hins_analyze_enveloped_json` is the sole analysis entry point exposed to mobile code. |
| Input | Bytecode is normalized locally and bounded to 512 KiB decoded size before native execution. |
| Report | Rust serializes a `hinsdale.report/v2` response; TypeScript validates the schema, selected quality tier, and required report fields. |
| Unavailable environment | Expo Go and web preview return `NATIVE_ENGINE_UNAVAILABLE`; no report is fabricated. |
| Persistence | Only validated v2 reports are stored in local history. |
| Transport | No bytecode, bearer token, or remote engine URL is configured in the mobile client. |

## Differential Evaluation Contract

The evaluation runner consumes only saved JSON artifacts from Heimdall-rs and Gigahorse. It does not download, install, or execute external binaries in application or CI jobs. Each artifact is verified against a manifest entry containing its producer, producer version, input bytecode digest, report digest, and capture time. The normalizer produces a comparison record for selector overlap, recovered function counts, source availability, reported control-flow counts, and normalized diagnostic codes. Regression gates operate only on deterministic ratios and explicit thresholds declared in the benchmark manifest.

> Hinsdale, Heimdall-rs, and Gigahorse outputs use different internal representations. Differential metrics identify disagreement; they do not establish that any tool’s reconstruction is source-equivalent or security-complete.
