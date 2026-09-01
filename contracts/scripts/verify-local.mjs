#!/usr/bin/env node
// Deploy HinsdaleReceiver into an in-process EVM (Cancun) and exercise it.
//
//   node contracts/scripts/verify-local.mjs
//
// Verifies, against a real EVM rather than by inspection:
//   * CREATE2 places the contract at the address predict.mjs computes
//   * value can be received both bare and through deposit()
//   * withdrawals are owner-gated and actually move value
//   * the two-step ownership handover works and is nominee-gated
import { Common, Chain, Hardfork } from "@ethereumjs/common";
import { EVM } from "@ethereumjs/evm";
import { DefaultStateManager } from "@ethereumjs/statemanager";
import { Account, Address, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { Interface } from "ethers";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  compile, artifact, initCodeFor, predictAddress, requireAddress,
  DEFAULT_SALT, CREATE2_DEPLOYER, OUT,
} from "./lib.mjs";

const ONE_ETHER = 10n ** 18n;
const GAS = 30_000_000n;

// Override with RECEIVER_OWNER to rehearse the exact contract you will deploy.
const OWNER = requireAddress(process.env.RECEIVER_OWNER ?? "0x00000000000000000000000000000000000000A1", "RECEIVER_OWNER");
const STRANGER = "0x00000000000000000000000000000000000000B2";
const PAYEE = "0x00000000000000000000000000000000000000C3";
// Deploy from the real deterministic proxy, so the address asserted below is
// the exact address this contract will occupy on a live chain.
const DEPLOYER = CREATE2_DEPLOYER;

const addr = (hex) => new Address(hexToBytes(hex));

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

const { output } = compile({ withFixtures: false });
const { abi, runtime } = artifact(output, "src/HinsdaleReceiver.sol", "HinsdaleReceiver");
const iface = new Interface(abi);
const initCode = initCodeFor(output, "src/HinsdaleReceiver.sol", "HinsdaleReceiver", ["address"], [OWNER]);

const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Cancun });
const stateManager = new DefaultStateManager();
const evm = await EVM.create({ common, stateManager });

for (const who of [OWNER, STRANGER, DEPLOYER]) {
  await stateManager.putAccount(addr(who), new Account(0n, 10n * ONE_ETHER));
}

const balanceOf = async (hex) => (await stateManager.getAccount(addr(hex)))?.balance ?? 0n;

async function call({ from, to, data = "0x", value = 0n }) {
  const res = await evm.runCall({
    caller: addr(from),
    origin: addr(from),
    to: to ? addr(to) : undefined,
    data: hexToBytes(data),
    value,
    gasLimit: GAS,
  });
  return {
    reverted: res.execResult.exceptionError !== undefined,
    returnValue: bytesToHex(res.execResult.returnValue),
    createdAddress: res.createdAddress?.toString(),
    gasUsed: res.execResult.executionGasUsed,
  };
}

const read = async (fn, args = []) => {
  const r = await call({ from: STRANGER, to: receiver, data: iface.encodeFunctionData(fn, args) });
  if (r.reverted) throw new Error(`${fn} reverted`);
  return iface.decodeFunctionResult(fn, r.returnValue)[0];
};

console.log("HinsdaleReceiver — in-process EVM verification (Cancun)\n");

// --- deployment ------------------------------------------------------------
const predicted = predictAddress(initCode, DEFAULT_SALT, DEPLOYER);
const create = await evm.runCall({
  caller: addr(DEPLOYER),
  origin: addr(DEPLOYER),
  data: hexToBytes(initCode),
  salt: hexToBytes(DEFAULT_SALT),
  gasLimit: GAS,
});
const receiver = create.createdAddress?.toString();

check("CREATE2 deploys", receiver !== undefined, `gas ${create.execResult.executionGasUsed}`);
console.log(`        deployed from ${CREATE2_DEPLOYER} — the live-chain address`);
check("address matches prediction", receiver?.toLowerCase() === predicted.toLowerCase(), predicted);
check(
  "runtime bytecode matches artifact",
  bytesToHex(await stateManager.getContractCode(addr(receiver))).toLowerCase() === runtime.toLowerCase(),
  `${(runtime.length - 2) / 2} bytes`,
);
check("owner is the constructor argument", (await read("owner")).toLowerCase() === OWNER.toLowerCase());

// --- receiving -------------------------------------------------------------
const bare = await call({ from: STRANGER, to: receiver, value: ONE_ETHER });
check("bare transfer accepted by receive()", !bare.reverted, `gas ${bare.gasUsed}`);
check("receive() fits the 2300 gas stipend", bare.gasUsed <= 2300n, `${bare.gasUsed} gas`);

const dep = await call({ from: STRANGER, to: receiver, data: iface.encodeFunctionData("deposit"), value: 2n * ONE_ETHER });
check("deposit() accepted", !dep.reverted);
check("balance() reports 3 ETH", (await read("balance")) === 3n * ONE_ETHER);

const zeroDep = await call({ from: STRANGER, to: receiver, data: iface.encodeFunctionData("deposit"), value: 0n });
check("deposit() rejects zero value", zeroDep.reverted);

// --- withdrawal access control --------------------------------------------
const stealAll = await call({ from: STRANGER, to: receiver, data: iface.encodeFunctionData("withdrawAll", [STRANGER]) });
check("non-owner withdrawAll reverts", stealAll.reverted);

const steal = await call({ from: STRANGER, to: receiver, data: iface.encodeFunctionData("withdraw", [STRANGER, ONE_ETHER]) });
check("non-owner withdraw reverts", steal.reverted);

const overdraw = await call({ from: OWNER, to: receiver, data: iface.encodeFunctionData("withdraw", [PAYEE, 99n * ONE_ETHER]) });
check("withdraw beyond balance reverts", overdraw.reverted);

const toZero = await call({ from: OWNER, to: receiver, data: iface.encodeFunctionData("withdraw", [
  "0x0000000000000000000000000000000000000000", ONE_ETHER]) });
check("withdraw to zero address reverts", toZero.reverted);

// --- withdrawal happy path -------------------------------------------------
const part = await call({ from: OWNER, to: receiver, data: iface.encodeFunctionData("withdraw", [PAYEE, ONE_ETHER]) });
check("owner withdraw succeeds", !part.reverted);
check("payee credited 1 ETH", (await balanceOf(PAYEE)) === ONE_ETHER);

const rest = await call({ from: OWNER, to: receiver, data: iface.encodeFunctionData("withdrawAll", [PAYEE]) });
check("owner withdrawAll succeeds", !rest.reverted);
check("payee credited 3 ETH total", (await balanceOf(PAYEE)) === 3n * ONE_ETHER);
check("receiver drained", (await read("balance")) === 0n);

const emptyDrain = await call({ from: OWNER, to: receiver, data: iface.encodeFunctionData("withdrawAll", [PAYEE]) });
check("withdrawAll on empty balance reverts", emptyDrain.reverted);

// --- ownership handover ----------------------------------------------------
const nominate = await call({ from: OWNER, to: receiver, data: iface.encodeFunctionData("transferOwnership", [STRANGER]) });
check("owner nominates successor", !nominate.reverted);
check("owner unchanged until accepted", (await read("owner")).toLowerCase() === OWNER.toLowerCase());

const wrongAccept = await call({ from: PAYEE, to: receiver, data: iface.encodeFunctionData("acceptOwnership") });
check("non-nominee acceptOwnership reverts", wrongAccept.reverted);

const accept = await call({ from: STRANGER, to: receiver, data: iface.encodeFunctionData("acceptOwnership") });
check("nominee accepts", !accept.reverted);
check("owner is the nominee", (await read("owner")).toLowerCase() === STRANGER.toLowerCase());
check("pendingOwner cleared", (await read("pendingOwner")) === "0x0000000000000000000000000000000000000000");

const staleOwner = await call({ from: OWNER, to: receiver, data: iface.encodeFunctionData("withdrawAll", [OWNER]) });
check("previous owner loses access", staleOwner.reverted);

// --- hand the runtime code to the analyzer ---------------------------------
const hexPath = join(OUT, "HinsdaleReceiver.runtime.hex");
writeFileSync(hexPath, runtime.slice(2) + "\n");
console.log(`\nruntime bytecode -> ${hexPath}`);
console.log(`  analyze with: ./target/release/hinsdale-cli --hex-file ${hexPath}`);

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
