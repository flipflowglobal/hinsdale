// Shared helpers for the Hinsdale contract scripts.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import { getCreate2Address, keccak256, AbiCoder, isAddress, getAddress } from "ethers";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CONTRACTS = join(ROOT, "contracts");
export const OUT = join(CONTRACTS, "out");

/// Arachnid's deterministic-deployment proxy, present at the same address on
/// every chain that has replayed its pre-signed deployment transaction.
export const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

/// Fixed salt so a given owner always yields the same receiver address.
export const DEFAULT_SALT = keccak256(Buffer.from("hinsdale.receiver.v1"));

function collectSources(dir, prefix) {
  const sources = {};
  if (!existsSync(dir)) return sources;
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".sol")) sources[`${prefix}/${f}`] = { content: readFileSync(join(dir, f), "utf8") };
  }
  return sources;
}

export function compile({ withFixtures = true } = {}) {
  const sources = {
    ...collectSources(join(CONTRACTS, "src"), "src"),
    ...(withFixtures ? collectSources(join(CONTRACTS, "fixtures"), "fixtures") : {}),
  };

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 1_000_000 },
      evmVersion: "cancun",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const fatal = (output.errors ?? []).filter((e) => e.severity === "error");
  if (fatal.length) throw new Error(fatal.map((e) => e.formattedMessage).join("\n"));

  const warnings = (output.errors ?? []).filter((e) => e.severity !== "error");
  return { output, warnings, version: solc.version() };
}

export function artifact(output, file, name) {
  const c = output.contracts?.[file]?.[name];
  if (!c) throw new Error(`contract ${name} not found in ${file}`);
  return {
    abi: c.abi,
    initCode: "0x" + c.evm.bytecode.object,
    runtime: "0x" + c.evm.deployedBytecode.object,
  };
}

/// init code = creation bytecode ++ abi-encoded constructor args
export function initCodeFor(output, file, name, types, values) {
  const { initCode } = artifact(output, file, name);
  if (!types.length) return initCode;
  return initCode + AbiCoder.defaultAbiCoder().encode(types, values).slice(2);
}

export function predictAddress(initCode, salt = DEFAULT_SALT, deployer = CREATE2_DEPLOYER) {
  return getCreate2Address(deployer, salt, keccak256(initCode));
}

export function requireAddress(value, label) {
  if (!value || !isAddress(value)) throw new Error(`${label} must be a valid address (got: ${value ?? "unset"})`);
  return getAddress(value);
}

export function writeArtifacts(output) {
  mkdirSync(OUT, { recursive: true });
  const index = {};
  for (const [file, contracts] of Object.entries(output.contracts ?? {})) {
    for (const [name, c] of Object.entries(contracts)) {
      const a = {
        abi: c.abi,
        initCode: "0x" + c.evm.bytecode.object,
        runtime: "0x" + c.evm.deployedBytecode.object,
      };
      writeFileSync(join(OUT, `${name}.json`), JSON.stringify(a, null, 2) + "\n");
      index[name] = { file, runtimeBytes: (a.runtime.length - 2) / 2 };
    }
  }
  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}
