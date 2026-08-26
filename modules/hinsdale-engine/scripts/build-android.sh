#!/usr/bin/env bash
set -euo pipefail

: "${ANDROID_NDK_HOME:?Set ANDROID_NDK_HOME to the Android NDK path.}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT="$ROOT/modules/hinsdale-engine/android/src/main/jniLibs"
TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/hinsdale-target}"
HOST_TAG="${ANDROID_NDK_HOST_TAG:-linux-x86_64}"
API="${ANDROID_API_LEVEL:-24}"
NDK_BIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG/bin"

command -v cargo >/dev/null || { echo "cargo is required" >&2; exit 1; }
command -v rustup >/dev/null || { echo "rustup is required" >&2; exit 1; }
[[ -d "$NDK_BIN" ]] || { echo "Android NDK toolchain directory not found: $NDK_BIN" >&2; exit 1; }

# Keep iteration and output reproducible; these are the ABIs declared by Gradle.
declare -A TARGETS=(
  [arm64-v8a]=aarch64-linux-android
  [armeabi-v7a]=armv7-linux-androideabi
)
declare -A CLANG_TARGETS=(
  [arm64-v8a]=aarch64-linux-android
  [armeabi-v7a]=armv7a-linux-androideabi
)

for abi in arm64-v8a armeabi-v7a; do
  target="${TARGETS[$abi]}"
  clang_target="${CLANG_TARGETS[$abi]}"
  rustup target add "$target"
  linker="$NDK_BIN/${clang_target}${API}-clang"
  [[ -x "$linker" ]] || { echo "Android NDK linker not found or not executable: $linker" >&2; exit 1; }
  target_env="${target^^}"; target_env="${target_env//-/_}"
  export "CARGO_TARGET_${target_env}_LINKER=$linker"

  CARGO_TARGET_DIR="$TARGET_DIR" cargo build --locked --manifest-path "$ROOT/engine/Cargo.toml" --release --target "$target"
  source_library="$TARGET_DIR/$target/release/libhinsdale.so"
  [[ -s "$source_library" ]] || { echo "Rust Android library was not produced: $source_library" >&2; exit 1; }

  destination="$OUT/$abi/libhinsdale_engine.so"
  mkdir -p "$(dirname "$destination")"
  cp "$source_library" "$destination"
  [[ -s "$destination" ]] || { echo "Copied Android library is empty: $destination" >&2; exit 1; }
done

echo "Built Android Hinsdale engine libraries for arm64-v8a and armeabi-v7a."
