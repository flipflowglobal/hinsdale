#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT="$ROOT/modules/hinsdale-engine/ios"; TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/hinsdale-ios-target}"
for target in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  rustup target add "$target"; CARGO_TARGET_DIR="$TARGET_DIR" cargo build --manifest-path "$ROOT/engine/Cargo.toml" --release --target "$target"
done
rm -rf "$OUT/HinsdaleEngine.xcframework" "$OUT/simulator"; mkdir -p "$OUT/simulator"
lipo -create "$TARGET_DIR/aarch64-apple-ios-sim/release/libhinsdale.a" "$TARGET_DIR/x86_64-apple-ios/release/libhinsdale.a" -output "$OUT/simulator/libhinsdale.a"
xcodebuild -create-xcframework -library "$TARGET_DIR/aarch64-apple-ios/release/libhinsdale.a" -headers "$OUT" -library "$OUT/simulator/libhinsdale.a" -headers "$OUT" -output "$OUT/HinsdaleEngine.xcframework"

