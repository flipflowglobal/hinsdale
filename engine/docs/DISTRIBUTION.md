# Distribution and Validation Contract

The Rust engine emits `hinsdale.report/v2`. Consumers must check `schema_version`, `schema_policy`, `metadata.analysis_profile`, and `capabilities.limitation` before relying on an analysis. The default Fast profile is a triage mode. Precise and Research increase bounded reconstruction effort but do not prove correctness, source equivalence, or the absence of security issues. The binding compatibility, migration, and deprecation rules are in [Schema Compatibility Policy](SCHEMA_COMPATIBILITY_POLICY.md).

The `benchmarks/corpus` directory contains provenance-bearing public fixtures. `hinsdale-bench` produces deterministic JSON metrics that can be retained in CI. The differential adapter compares saved artifacts only; it does not silently install or run external tools. This keeps comparisons with Heimdall-rs and Gigahorse reproducible and attributable.

Build the CLI with `cargo build --release --bin hinsdale-cli`. Run `make test` and `make benchmark` before packaging. The Dockerfile supplies a pinned Rust build stage and a minimal non-root runtime image. Published images should be tagged with the crate version and report-schema version.

## Native Artifact Build Contract

The Android artifact script requires `ANDROID_NDK_HOME`, uses API level 24 by default, builds the Gradle-declared `arm64-v8a` and `armeabi-v7a` targets in deterministic order, and runs Cargo with `--locked`. The iOS script is restricted to macOS with Xcode, builds device plus Apple Silicon and Intel simulator targets, merges simulator archives, and creates the XCFramework with a required `Info.plist`. Both scripts fail before copying output when the required toolchain or artifact is absent.

CI pins the Rust toolchain to the repository’s validated compiler version, uses frozen pnpm dependencies, retains uploaded native artifacts for 14 days, and runs the artifact verifier both before upload and after download. The verifier checks Android ELF headers, iOS archive or Mach-O headers, required FFI symbols, and device/simulator slice count. These checks do not replace signed-device testing.
