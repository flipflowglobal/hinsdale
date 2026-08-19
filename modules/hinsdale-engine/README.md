# Hinsdale Embedded Engine Module

This Expo Module packages the Hinsdale Rust library into the native application. It has no JavaScript analysis fallback. Expo Go and the web preview intentionally return `NATIVE_ENGINE_UNAVAILABLE` because neither runtime includes the application’s Android or iOS native libraries.

## Required Release Build Steps

Run `pnpm engine:android` on a Linux runner with an Android NDK and `pnpm engine:ios` on macOS with Xcode. Both scripts compile the Rust library from `engine/`; Android copies `libhinsdale_engine.so` for `arm64-v8a` and `armeabi-v7a`, while iOS creates `HinsdaleEngine.xcframework` for device and simulator slices. Finish with `pnpm engine:verify` before creating a custom development client or release artifact.

The native ABI is `hins_analyze_enveloped_json`. It accepts bytecode and an execution tier, enforces a 512 KiB decoded-input ceiling, and returns only a versioned JSON envelope. Callers validate `hinsdale.report/v2` before persisting or rendering a result.
