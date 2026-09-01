# Hinsdale Contracts

Solidity sources, deterministic deployment tooling, and detector fixtures for
the Hinsdale toolchain.

```
contracts/
├── src/HinsdaleReceiver.sol          # the payment receiver
├── fixtures/DetectorFixtures.sol     # deliberately vulnerable — never deploy
├── scripts/
│   ├── lib.mjs                       # compile + CREATE2 helpers
│   ├── build.mjs                     # solc → contracts/out/
│   ├── predict.mjs                   # receiver address for an owner (offline)
│   ├── deploy.mjs                    # CREATE2 deployment to a live RPC
│   ├── verify-local.mjs              # in-process EVM deploy + behaviour tests
│   └── analyze.mjs                   # run hinsdale-cli over the compiled code
└── out/                              # build artifacts (git-ignored)
```

## Setup

```bash
cd contracts && npm install
```

solc 0.8.26 is pinned, optimizer on (1,000,000 runs), EVM version `cancun`.
Builds are byte-reproducible, so the predicted address below is stable.

## The receiver address is deterministic

`HinsdaleReceiver` is deployed through the deterministic deployment proxy at
`0x4e59b44847b379578588920cA78FbF26c0B4956C`, which exists at that same address
on every chain that has replayed its pre-signed deployment transaction
(Ethereum, Sepolia, Base, Arbitrum, Optimism, Polygon, BNB Chain, and others).

```
receiver = CREATE2(proxy, salt, keccak256(creationCode ++ abi.encode(owner)))
salt     = keccak256("hinsdale.receiver.v1")
```

The owner is a constructor argument, so it is part of the init code and
therefore part of the address. **One owner ⇒ one address, identical on every
chain.** A different owner is a different address; this binding is deliberate,
so an address cannot be reused under new ownership.

Compute it without touching a network:

```bash
node scripts/predict.mjs 0xYourOwnerAddress
```

Worked example — owner `0x00000000000000000000000000000000000000A1`:

```
salt     0xbf75767d38d2b74155a298fcc32d84e78251c0f832cf8ff95376dd8702694f04
receiver 0xA3476EF97a04190278f7035e0Fe7f73AF50aa198
```

## Deploying

```bash
export RPC_URL=https://...
export RECEIVER_OWNER=0xYourOwnerAddress

node scripts/deploy.mjs --dry-run     # resolve address, check for existing code
PRIVATE_KEY=0x... node scripts/deploy.mjs
```

`deploy.mjs` refuses to run if the deterministic proxy is absent from the target
chain, and exits cleanly if code already exists at the predicted address, so
re-running it is safe.

The deploying key needs gas only. It never becomes the owner and has no
authority over the contract afterwards — ownership comes from
`RECEIVER_OWNER`. Use a hardware wallet or multisig as the owner.

## Verifying before you deploy

```bash
node scripts/verify-local.mjs                              # default test owner
RECEIVER_OWNER=0xYourOwnerAddress node scripts/verify-local.mjs
```

Deploys into an in-process Cancun EVM and asserts, among 26 checks, that the
CREATE2 address matches `predict.mjs`, that `receive()` stays inside the 2300
gas stipend, that withdrawals are owner-gated, and that the two-step ownership
handover revokes the previous owner.

The rehearsal deploys from the real deterministic proxy rather than a test EOA,
so the address it asserts is the address the contract will occupy on a live
chain. Set `RECEIVER_OWNER` to your intended owner and the run becomes a dress
rehearsal of the exact deployment: same init code, same address, same owner.

## Auditing with Hinsdale itself

```bash
cargo build --release --bin hinsdale-cli   # from the repo root
node scripts/analyze.mjs --security-only
```

Runs every compiled contract's runtime bytecode through the decompiler in this
repo. The fixtures under `fixtures/` each reproduce exactly one pattern that
`src/security.rs` claims to detect, giving the analyzer a known ground truth to
regress against.

## HinsdaleReceiver design notes

| Decision | Reason |
|---|---|
| `receive()` has an empty body | Stays under the 2300 gas stipend, so `transfer()` and `send()` from other contracts still work (measured: 55 gas). |
| `deposit()` exists alongside it | Callers willing to pay gas get an attributable `Deposited` event; `receive()` cannot emit one and stay under the stipend. |
| Two-step ownership transfer | A typo in `transferOwnership` cannot strand the contract — the nominee must call `acceptOwnership`. |
| `nonReentrant` on all withdrawals | Withdrawals hand control to an arbitrary `to`; the latch plus CEI ordering means a re-entered call finds no state left to exploit. |
| ERC-20 transfer via low-level call | Tolerates tokens that return no data (USDT) and tokens returning `bool`; both are checked. |
| No `delegatecall`, no `selfdestruct`, no `tx.origin` | Nothing to hijack, nothing to destroy, no phishable auth path. |
| No proxy, no upgradeability | The deployed code is the whole contract. Migration is: withdraw, deploy a new receiver. |

### Known limitations

- Rescue is owner-only, so a compromised owner key drains the contract. Use a
  multisig owner for anything material.
- ERC-721 and ERC-1155 are not handled; NFTs sent here are stuck. This is a
  fungible-value receiver only.
- Rebasing and fee-on-transfer tokens are withdrawn by explicit amount, not by
  balance; query the token first.
