#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -s)" == "Darwin" ]] || { echo "build-ios.sh must run on macOS with Xcode installed" >&2; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT="$ROOT/modules/hinsdale-engine/ios"
TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/hinsdale-ios-target}"
DEVICE_TARGET="aarch64-apple-ios"
SIM_ARM_TARGET="aarch64-apple-ios-sim"
SIM_X86_TARGET="x86_64-apple-ios"

command -v cargo >/dev/null || { echo "cargo is required" >&2; exit 1; }
command -v rustup >/dev/null || { echo "rustup is required" >&2; exit 1; }
command -v xcodebuild >/dev/null || { echo "xcodebuild is required" >&2; exit 1; }
command -v lipo >/dev/null || { echo "lipo is required" >&2; exit 1; }

for target in "$DEVICE_TARGET" "$SIM_ARM_TARGET" "$SIM_X86_TARGET"; do
  rustup target add "$target"
  CARGO_TARGET_DIR="$TARGET_DIR" cargo build --locked --manifest-path "$ROOT/engine/Cargo.toml" --release --target "$target"
done

DEVICE_LIBRARY="$TARGET_DIR/$DEVICE_TARGET/release/libhinsdale.a"
SIM_ARM_LIBRARY="$TARGET_DIR/$SIM_ARM_TARGET/release/libhinsdale.a"
SIM_X86_LIBRARY="$TARGET_DIR/$SIM_X86_TARGET/release/libhinsdale.a"
for library in "$DEVICE_LIBRARY" "$SIM_ARM_LIBRARY" "$SIM_X86_LIBRARY"; do
  [[ -s "$library" ]] || { echo "Rust iOS library was not produced: $library" >&2; exit 1; }
done

FRAMEWORK="$OUT/HinsdaleEngine.xcframework"
SIMULATOR_DIR="$OUT/simulator"
rm -rf "$FRAMEWORK" "$SIMULATOR_DIR"
mkdir -p "$SIMULATOR_DIR"
lipo -create "$SIM_ARM_LIBRARY" "$SIM_X86_LIBRARY" -output "$SIMULATOR_DIR/libhinsdale.a"
[[ -s "$SIMULATOR_DIR/libhinsdale.a" ]] || { echo "Simulator library assembly failed" >&2; exit 1; }
xcodebuild -create-xcframework \
  -library "$DEVICE_LIBRARY" -headers "$OUT" \
  -library "$SIMULATOR_DIR/libhinsdale.a" -headers "$OUT" \
  -output "$FRAMEWORK"
[[ -f "$FRAMEWORK/Info.plist" ]] || { echo "XCFramework manifest was not produced" >&2; exit 1; }

echo "Built iOS HinsdaleEngine.xcframework for device and simulator slices."
