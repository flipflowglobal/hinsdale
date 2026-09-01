#!/usr/bin/env node
// Feed the compiled runtime bytecode of every contract through hinsdale-cli.
//
//   node contracts/scripts/analyze.mjs [--security-only]
//
// Closes the loop: the analyzer in this repo audits the contracts in this repo.
// Skips with a clear message when the Rust binary has not been built.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { compile, artifact, ROOT, OUT } from "./lib.mjs";

const CLI = join(ROOT, "target", "release", "hinsdale-cli");
const mode = process.argv.includes("--security-only") ? "--security-only" : "--summary";

if (!existsSync(CLI)) {
  console.error(`hinsdale-cli not found at ${CLI}`);
  console.error("build it first:  cargo build --release --bin hinsdale-cli");
  process.exit(2);
}

const { output } = compile();
mkdirSync(OUT, { recursive: true });

const targets = [];
for (const [file, contracts] of Object.entries(output.contracts ?? {})) {
  for (const name of Object.keys(contracts)) targets.push([file, name]);
}
targets.sort(([, a], [, b]) => a.localeCompare(b));

for (const [file, name] of targets) {
  const { runtime } = artifact(output, file, name);
  const hexPath = join(OUT, `${name}.runtime.hex`);
  writeFileSync(hexPath, runtime.slice(2) + "\n");

  console.log(`\n=== ${name}  (${file}) ===`);
  try {
    console.log(execFileSync(CLI, [mode, "--hex-file", hexPath], { encoding: "utf8" }).trimEnd());
  } catch (err) {
    console.error(`hinsdale-cli failed: ${err.message}`);
    process.exitCode = 1;
  }
}
