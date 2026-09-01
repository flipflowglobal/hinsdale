#!/usr/bin/env node
// Compile every contract and write artifacts to contracts/out/.
import { compile, writeArtifacts, OUT } from "./lib.mjs";

const { output, warnings, version } = compile();
console.log(`solc ${version}`);
for (const w of warnings) console.warn(w.formattedMessage.trimEnd());

const index = writeArtifacts(output);
console.log(`\nartifacts -> ${OUT}`);
for (const [name, meta] of Object.entries(index)) {
  console.log(`  ${name.padEnd(20)} ${String(meta.runtimeBytes).padStart(6)} runtime bytes  (${meta.file})`);
}
