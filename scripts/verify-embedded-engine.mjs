import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "modules/hinsdale-engine/android/src/main/jniLibs/arm64-v8a/libhinsdale_engine.so",
  "modules/hinsdale-engine/android/src/main/jniLibs/armeabi-v7a/libhinsdale_engine.so",
  "modules/hinsdale-engine/ios/HinsdaleEngine.xcframework",
];

const missing = [];
for (const relativePath of required) {
  const absolutePath = resolve(root, relativePath);
  try {
    await access(absolutePath, constants.R_OK);
    const metadata = await stat(absolutePath);
    if (metadata.isFile() && metadata.size === 0) missing.push(`${relativePath} is empty`);
  } catch {
    missing.push(relativePath);
  }
}

if (missing.length) {
  console.error("Embedded Rust engine artifacts are missing:\n" + missing.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Embedded Rust engine artifacts verified for Android arm64-v8a, Android armeabi-v7a, and iOS.");
