# Offline Differential Artifacts

This directory receives curated, already-produced artifacts from external decompilers. CI never downloads, installs, or executes Heimdall-rs or Gigahorse. Each peer artifact must be a JSON envelope with `schema_version: "hinsdale.peer-artifact/v1"`, `producer`, `producer_version`, `captured_at`, `input_bytecode_sha256`, and a `selectors` array. The envelope is immutable after capture; its exact SHA-256 is recorded in the differential manifest.

A `hinsdale.differential-manifest/v1` file records each Hinsdale report path, its expected bytecode digest, paths to peer artifacts, the peer artifact digests, and a deterministic selector-overlap threshold. Run the workflow manually with the committed manifest path, or invoke it from an upstream workflow after artifacts have been reviewed and committed.
