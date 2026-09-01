#!/usr/bin/env node
// Deploy HinsdaleReceiver at its deterministic CREATE2 address.
//
//   RPC_URL=... PRIVATE_KEY=... RECEIVER_OWNER=0x... node scripts/deploy.mjs [--dry-run]
//
// --dry-run (the default when PRIVATE_KEY is unset) resolves the address and
// reports whether code already exists there, without sending a transaction.
import { JsonRpcProvider, Wallet, concat } from "ethers";
import { compile, initCodeFor, predictAddress, requireAddress, DEFAULT_SALT, CREATE2_DEPLOYER } from "./lib.mjs";

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
const dryRun = process.argv.includes("--dry-run") || !privateKey;
const owner = requireAddress(process.env.RECEIVER_OWNER, "RECEIVER_OWNER");
const salt = process.env.RECEIVER_SALT ?? DEFAULT_SALT;

if (!rpcUrl) throw new Error("RPC_URL is required");

const { output } = compile({ withFixtures: false });
const initCode = initCodeFor(output, "src/HinsdaleReceiver.sol", "HinsdaleReceiver", ["address"], [owner]);
const predicted = predictAddress(initCode, salt);

const provider = new JsonRpcProvider(rpcUrl);
const { chainId, name } = await provider.getNetwork();

console.log(`network   ${name} (chainId ${chainId})`);
console.log(`owner     ${owner}`);
console.log(`salt      ${salt}`);
console.log(`predicted ${predicted}`);

const deployerCode = await provider.getCode(CREATE2_DEPLOYER);
if (deployerCode === "0x") {
  throw new Error(
    `deterministic deployment proxy is not present at ${CREATE2_DEPLOYER} on this chain; ` +
      `deploy it first (see contracts/README.md) or use a chain that has it`,
  );
}

const existing = await provider.getCode(predicted);
if (existing !== "0x") {
  console.log(`\nalready deployed — ${(existing.length - 2) / 2} bytes of runtime code at ${predicted}`);
  process.exit(0);
}

if (dryRun) {
  console.log("\ndry run — nothing deployed. Set PRIVATE_KEY to broadcast.");
  process.exit(0);
}

const wallet = new Wallet(privateKey, provider);
console.log(`sender    ${wallet.address}`);

const tx = await wallet.sendTransaction({ to: CREATE2_DEPLOYER, data: concat([salt, initCode]) });
console.log(`\ntx        ${tx.hash}`);
const receipt = await tx.wait();
console.log(`block     ${receipt.blockNumber}  gas ${receipt.gasUsed}`);

const code = await provider.getCode(predicted);
if (code === "0x") throw new Error(`deployment produced no code at ${predicted}`);

console.log(`\nreceiver  ${predicted}  (${(code.length - 2) / 2} runtime bytes)`);
