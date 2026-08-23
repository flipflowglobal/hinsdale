import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const args = new Map(process.argv.slice(2).filter((_, index) => index % 2 === 0).map((flag, index) => [flag, process.argv.slice(2)[index * 2 + 1]]));
const manifestPath = args.get("--manifest");
const outputPath = args.get("--out");
if (!manifestPath || !outputPath) throw new Error("Usage: node evaluate-differential-artifacts.mjs --manifest <manifest.json> --out <report.json>");

const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
if (manifest.schema_version !== "hinsdale.differential-manifest/v1" || !Array.isArray(manifest.entries)) throw new Error("Invalid differential manifest.");
const root = dirname(resolve(manifestPath));
const select = (report) => new Set((report?.signatures?.functions ?? []).map((item) => item.selector).filter((value) => typeof value === "string"));
const jaccard = (left, right) => { const union = new Set([...left, ...right]); return union.size === 0 ? 1 : [...left].filter((item) => right.has(item)).length / union.size; };
const metrics = [];

for (const entry of manifest.entries) {
  const hinsdaleRaw = await readFile(resolve(root, entry.hinsdale_report), "utf8");
  const hinsdale = JSON.parse(hinsdaleRaw);
  if (hinsdale.metadata?.bytecode_sha256 !== entry.bytecode_sha256) throw new Error(`Hinsdale bytecode hash mismatch for ${entry.id}.`);
  const hinsdaleSelectors = select(hinsdale);
  for (const peerSpec of entry.peers ?? []) {
    if (!new Set(["heimdall-rs", "gigahorse"]).has(peerSpec.producer)) throw new Error(`Unsupported differential producer ${peerSpec.producer}.`);
    const raw = await readFile(resolve(root, peerSpec.artifact), "utf8");
    if (sha256(raw) !== peerSpec.artifact_sha256) throw new Error(`Artifact hash mismatch for ${entry.id}/${peerSpec.producer}.`);
    const peer = JSON.parse(raw);
    if (peer.schema_version !== "hinsdale.peer-artifact/v1" || peer.producer !== peerSpec.producer || peer.input_bytecode_sha256 !== entry.bytecode_sha256) throw new Error(`Invalid provenance envelope for ${entry.id}/${peerSpec.producer}.`);
    const peerSelectors = new Set(peer.selectors ?? []);
    const selectorJaccard = jaccard(hinsdaleSelectors, peerSelectors);
    const minimum = manifest.thresholds?.minimum_selector_jaccard ?? 0;
    metrics.push({ id: entry.id, producer: peerSpec.producer, bytecode_sha256: entry.bytecode_sha256, hinsdale_selector_count: hinsdaleSelectors.size, peer_selector_count: peerSelectors.size, selector_jaccard: selectorJaccard, passed: selectorJaccard >= minimum });
  }
}
const report = { schema_version: "hinsdale.differential-report/v1", generated_at: new Date().toISOString(), passed: metrics.every((metric) => metric.passed), metrics };
await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 2;
