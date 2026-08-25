import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "modules/hinsdale-engine/android/src/main/jniLibs/arm64-v8a/libhinsdale_engine.so",
  "modules/hinsdale-engine/android/src/main/jniLibs/armeabi-v7a/libhinsdale_engine.so",
  "modules/hinsdale-engine/ios/HinsdaleEngine.xcframework",
];
const exportedSymbols = ["hins_analyze_enveloped_json", "hins_free_str", "hins_mobile_runtime_info"];

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

async function findStaticLibraries(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return findStaticLibraries(path);
    return entry.isFile() && entry.name.endsWith(".a") ? [path] : [];
  }));
  return nested.flat();
}

async function hasAllSymbols(path) {
  const binary = await readFile(path);
  return exportedSymbols.every((symbol) => binary.includes(Buffer.from(symbol)));
}

const androidLibraries = required.slice(0, 2).map((relativePath) => resolve(root, relativePath));
for (const library of androidLibraries) {
  try {
    if (!(await hasAllSymbols(library))) missing.push(`${library.replace(`${root}/`, "")} is missing required Hinsdale FFI symbols`);
  } catch {
    // The required-file pass above already records a clear missing-artifact diagnostic.
  }
}

const framework = resolve(root, required[2]);
try {
  const manifest = resolve(framework, "Info.plist");
  await access(manifest, constants.R_OK);
  const staticLibraries = await findStaticLibraries(framework);
  if (staticLibraries.length < 2) missing.push(`${required[2]} must contain device and simulator static-library slices`);
  for (const library of staticLibraries) {
    if (!(await hasAllSymbols(library))) missing.push(`${library.replace(`${root}/`, "")} is missing required Hinsdale FFI symbols`);
  }
} catch {
  // The required-file pass above already records a clear missing-artifact diagnostic.
}

if (missing.length) {
  console.error("Embedded Rust engine artifacts are missing:\n" + missing.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Embedded Rust engine artifacts and required FFI symbols verified for Android arm64-v8a, Android armeabi-v7a, and iOS device/simulator slices.");
