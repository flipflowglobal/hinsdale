#!/usr/bin/env node
// Print the deterministic CREATE2 address of HinsdaleReceiver for an owner.
//
//   node scripts/predict.mjs <ownerAddress> [salt]
//
// The address is chain-independent: any chain carrying the deterministic
// deployment proxy yields this same address for this owner and salt.
import { compile, initCodeFor, predictAddress, requireAddress, DEFAULT_SALT, CREATE2_DEPLOYER } from "./lib.mjs";

const owner = requireAddress(process.argv[2] ?? process.env.RECEIVER_OWNER, "owner");
const salt = process.argv[3] ?? process.env.RECEIVER_SALT ?? DEFAULT_SALT;

const { output } = compile({ withFixtures: false });
const initCode = initCodeFor(output, "src/HinsdaleReceiver.sol", "HinsdaleReceiver", ["address"], [owner]);
const address = predictAddress(initCode, salt);

console.log(`owner    ${owner}`);
console.log(`salt     ${salt}`);
console.log(`deployer ${CREATE2_DEPLOYER}`);
console.log(`\nreceiver ${address}`);
