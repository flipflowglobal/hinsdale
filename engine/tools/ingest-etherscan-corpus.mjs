import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const args = new Map(process.argv.slice(2).filter((_, index, values) => index % 2 === 0).map((flag, index) => [flag, process.argv.slice(2)[index * 2 + 1]]));
const manifestPath = args.get("--manifest");
const outputPath = args.get("--out");

if (!manifestPath || !outputPath) throw new Error("Usage: node ingest-etherscan-corpus.mjs --manifest <addresses.json> --out <directory>");
if (!process.env.ETHERSCAN_API_KEY) throw new Error("ETHERSCAN_API_KEY is required only for the offline corpus ingestion job.");

const requestManifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
if (requestManifest.schema_version !== "hinsdale.etherscan-request/v1" || !Array.isArray(requestManifest.contracts)) throw new Error("Invalid corpus request manifest.");
const outputRoot = resolve(outputPath);
await mkdir(outputRoot, { recursive: true });
const records = [];

for (const entry of requestManifest.contracts) {
  if (!Number.isInteger(entry.chain_id) || !/^0x[a-fA-F0-9]{40}$/.test(entry.address)) throw new Error(`Invalid chain_id or address for ${entry.id ?? "manifest entry"}.`);
  const url = new URL("https://api.etherscan.io/v2/api");
  url.search = new URLSearchParams({ chainid: String(entry.chain_id), module: "contract", action: "getsourcecode", address: entry.address, apikey: process.env.ETHERSCAN_API_KEY }).toString();
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Etherscan rejected ${entry.address} with HTTP ${response.status}.`);
  const raw = await response.text();
  const payload = JSON.parse(raw);
  const result = Array.isArray(payload.result) ? payload.result[0] : null;
  if (payload.status !== "1" || !result || typeof result.SourceCode !== "string" || !result.SourceCode.trim()) throw new Error(`Etherscan did not return verified source for ${entry.address}.`);
  const record = {
    schema_version: "hinsdale.etherscan-provenance/v1", id: entry.id ?? `${entry.chain_id}-${entry.address.toLowerCase()}`, chain_id: entry.chain_id, address: entry.address,
    source_url: url.toString().replace(process.env.ETHERSCAN_API_KEY, "[redacted]"), retrieved_at: new Date().toISOString(),
    raw_response_sha256: sha256(raw), source_sha256: sha256(result.SourceCode), abi_sha256: sha256(String(result.ABI ?? "")),
    contract_name: result.ContractName, compiler_version: result.CompilerVersion, compiler_type: result.CompilerType, optimization_used: result.OptimizationUsed,
    optimization_runs: result.Runs, evm_version: result.EVMVersion, license_type: result.LicenseType, proxy: result.Proxy, implementation: result.Implementation,
  };
  const directory = join(outputRoot, record.id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "source.json"), raw);
  await writeFile(join(directory, "provenance.json"), `${JSON.stringify(record, null, 2)}\n`);
  records.push(record);
}
await writeFile(join(outputRoot, "corpus.manifest.v1.json"), `${JSON.stringify({ schema_version: "hinsdale.etherscan-corpus/v1", generated_at: new Date().toISOString(), records }, null, 2)}\n`);
