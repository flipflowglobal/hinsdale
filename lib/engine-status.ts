export const ENGINE_IMPLEMENTATION = [
  { title: "Control-flow recovery", status: "Foundation built", detail: "Confidence-bearing CFG edges, unresolved-jump evidence, loop summaries, and private-function candidates." },
  { title: "Symbolic lifting", status: "Foundation built", detail: "Bounded merged-state traversal, phi-style values, recovered returns, mapping candidates, and printable error words." },
  { title: "Evaluation contract", status: "Runnable", detail: "Public EIP-1167 fixture, structured metrics, saved-artifact differential adapter, CI workflow, and engine tests." },
  { title: "Distribution contract", status: "Runnable", detail: "Versioned v2 report schema, execution profiles, limitations document, Make targets, and container build." },
] as const;

export const ENGINE_BENCHMARK = {
  fixture: "EIP-1167 runtime minimal proxy",
  source: "https://eips.ethereum.org/EIPS/eip-1167",
  tier: "Precise",
  bytes: 45,
  blocks: 3,
  resolvedJumps: 1,
  unresolvedJumps: 0,
  privateCandidates: 1,
  status: "Expectation passed",
} as const;
