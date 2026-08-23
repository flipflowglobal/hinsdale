import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const args = new Map(process.argv.slice(2).filter((_, index, values) => index % 2 === 0).map((flag, index) => [flag, process.argv.slice(2)[index * 2 + 1]]));
const manifestPath = args.get("--manifest");
const outputPath = args.get("--out");

if (!manifestPath || !outputPath) throw new Error("Usage: node ingest-etherscan-corpus.mjs --manifest <addresses.json> --out <directory>");
if (!process.env.ETHERSCAN_API_KEY) throw new Error("ETHERSCAN_API_KEY is required only for the offline corpus ingestion job.");
if (!process.env.HINSDALE_CORPUS_RPC_URL || !process.env.HINSDALE_CORPUS_RPC_URL.startsWith("https://")) throw new Error("HINSDALE_CORPUS_RPC_URL must be an HTTPS JSON-RPC endpoint for offline corpus bytecode acquisition.");

const requestManifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
if (requestManifest.schema_version !== "hinsdale.etherscan-request/v1" || !Array.isArray(requestManifest.contracts)) throw new Error("Invalid corpus request manifest.");
const outputRoot = resolve(outputPath);
await mkdir(outputRoot, { recursive: true });
const records = [];

async function getRuntimeBytecode(address) {
  const response = await fetch(process.env.HINSDALE_CORPUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
  });
  if (!response.ok) throw new Error(`Runtime-code RPC rejected ${address} with HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error || typeof payload.result !== "string" || !/^0x[0-9a-fA-F]+$/.test(payload.result) || payload.result === "0x") throw new Error(`Runtime-code RPC did not return deployed runtime bytecode for ${address}.`);
  return payload.result.toLowerCase();
}

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
  const runtimeBytecode = await getRuntimeBytecode(entry.address);
  const record = {
    schema_version: "hinsdale.etherscan-provenance/v1", id: entry.id ?? `${entry.chain_id}-${entry.address.toLowerCase()}`, chain_id: entry.chain_id, address: entry.address,
    source_url: url.toString().replace(process.env.ETHERSCAN_API_KEY, "[redacted]"), retrieved_at: new Date().toISOString(),
    raw_response_sha256: sha256(raw), source_sha256: sha256(result.SourceCode), abi_sha256: sha256(String(result.ABI ?? "")), runtime_bytecode_sha256: sha256(runtimeBytecode),
    contract_name: result.ContractName, compiler_version: result.CompilerVersion, compiler_type: result.CompilerType, optimization_used: result.OptimizationUsed,
    optimization_runs: result.Runs, evm_version: result.EVMVersion, license_type: result.LicenseType, proxy: result.Proxy, implementation: result.Implementation,
  };
  const directory = join(outputRoot, record.id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "source.json"), raw);
  await writeFile(join(directory, "runtime-bytecode.hex"), `${runtimeBytecode}\n`);
  await writeFile(join(directory, "provenance.json"), `${JSON.stringify(record, null, 2)}\n`);
  records.push(record);
}
await writeFile(join(outputRoot, "corpus.manifest.v1.json"), `${JSON.stringify({ schema_version: "hinsdale.etherscan-corpus/v1", generated_at: new Date().toISOString(), records }, null, 2)}\n`);
