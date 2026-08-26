import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const required = [
  "modules/hinsdale-engine/android/src/main/jniLibs/arm64-v8a/libhinsdale_engine.so",
  "modules/hinsdale-engine/android/src/main/jniLibs/armeabi-v7a/libhinsdale_engine.so",
  "modules/hinsdale-engine/ios/HinsdaleEngine.xcframework",
];
const exportedSymbols = [
  "hins_analyze_enveloped_json",
  "hins_free_str",
  "hins_mobile_runtime_info",
];
const missing = [];

async function readablePath(relativePath) {
  const absolutePath = resolve(root, relativePath);
  try {
    await access(absolutePath, constants.R_OK);
    const metadata = await stat(absolutePath);
    if (metadata.isFile() && metadata.size === 0)
      missing.push(`${relativePath} is empty`);
    return { absolutePath, metadata };
  } catch {
    missing.push(relativePath);
    return null;
  }
}

async function findStaticLibraries(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return findStaticLibraries(path);
      return entry.isFile() && entry.name.endsWith(".a") ? [path] : [];
    }),
  );
  return nested.flat();
}

function startsWithAny(buffer, signatures) {
  return signatures.some((signature) =>
    buffer.subarray(0, signature.length).equals(Buffer.from(signature)),
  );
}

async function hasAllSymbols(path) {
  const binary = await readFile(path);
  return exportedSymbols.every((symbol) =>
    binary.includes(Buffer.from(symbol)),
  );
}

async function verifyAndroidLibrary(relativePath) {
  const result = await readablePath(relativePath);
  if (!result || !result.metadata.isFile()) return;
  const binary = await readFile(result.absolutePath);
  if (!startsWithAny(binary, [[0x7f, 0x45, 0x4c, 0x46]]))
    missing.push(`${relativePath} is not an ELF shared library`);
  if (!(await hasAllSymbols(result.absolutePath)))
    missing.push(`${relativePath} is missing required Hinsdale FFI symbols`);
}

await verifyAndroidLibrary(required[0]);
await verifyAndroidLibrary(required[1]);

const frameworkResult = await readablePath(required[2]);
if (frameworkResult?.metadata.isDirectory()) {
  const framework = frameworkResult.absolutePath;
  try {
    await access(resolve(framework, "Info.plist"), constants.R_OK);
    const staticLibraries = await findStaticLibraries(framework);
    if (staticLibraries.length < 2) {
      missing.push(
        `${required[2]} must contain device and simulator static-library slices`,
      );
    }
    for (const library of staticLibraries) {
      const binary = await readFile(library);
      if (
        !startsWithAny(binary, [
          [0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a], // !<arch> archive
          [0xca, 0xfe, 0xba, 0xbe],
          [0xbe, 0xba, 0xfe, 0xca], // fat Mach-O
          [0xca, 0xfe, 0xba, 0xbf],
          [0xbf, 0xba, 0xfe, 0xca],
        ])
      )
        missing.push(
          `${library.replace(`${root}/`, "")} is not a valid static-library or Mach-O archive`,
        );
      if (!(await hasAllSymbols(library)))
        missing.push(
          `${library.replace(`${root}/`, "")} is missing required Hinsdale FFI symbols`,
        );
    }
  } catch {
    missing.push(
      `${required[2]} is missing a readable Info.plist or static-library slices`,
    );
  }
}

if (missing.length) {
  console.error(
    "Embedded Rust engine artifact verification failed:\n" +
      missing.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(
  "Embedded Rust engine artifacts and required FFI symbols verified for Android arm64-v8a, Android armeabi-v7a, and iOS device/simulator slices.",
);
