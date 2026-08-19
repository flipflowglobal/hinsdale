#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_NDK_HOME:?Set ANDROID_NDK_HOME to the Android NDK path.}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT="$ROOT/modules/hinsdale-engine/android/src/main/jniLibs"
HOST_TAG="linux-x86_64"; API=24
declare -A TARGETS=([arm64-v8a]=aarch64-linux-android [armeabi-v7a]=armv7-linux-androideabi)
declare -A CLANG_TARGETS=([arm64-v8a]=aarch64-linux-android [armeabi-v7a]=armv7a-linux-androideabi)
for abi in "${!TARGETS[@]}"; do
  target="${TARGETS[$abi]}"; clang_target="${CLANG_TARGETS[$abi]}"; rustup target add "$target"
  linker="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG/bin/${clang_target}${API}-clang"
  target_env="${target^^}"; target_env="${target_env//-/_}"
  export "CARGO_TARGET_${target_env}_LINKER=$linker"
  CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/hinsdale-target}" cargo build --manifest-path "$ROOT/engine/Cargo.toml" --release --target "$target"
  mkdir -p "$OUT/$abi"; cp "${CARGO_TARGET_DIR:-/tmp/hinsdale-target}/$target/release/libhinsdale.so" "$OUT/$abi/libhinsdale_engine.so"
done
