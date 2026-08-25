import { describe, expect, it } from "vitest";

import { MAX_EMBEDDED_BYTECODE_BYTES, bytecodeValidationMessage, normalizeBytecode, reportFromEmbeddedEngine } from "../lib/hinsdale-data";

function nativeReport() {
  return {
    schema_version: "hinsdale.report/v2",
    schema_policy: { policy_version: "1.0", compatibility_mode: "additive-optional", breaking_change_rule: "new-schema-major", migration_required: false },
    metadata: { analysis_profile: "research", bytecode_sha256: "a".repeat(64), bytecode_len: 4, is_proxy: false },
    disassembly: { instruction_count: 2 },
    cfg_summary: { block_count: 1 },
    signatures: {
      functions: [],
      abi_events: [{ topic0: "0xddf252ad", name: "Transfer", known_signature: "Transfer(address,address,uint256)", parameters: [{ name: "from", ty: "address", indexed: true }], confidence: 0.98, evidence: [{ log_offset: 16, log_opcode: "LOG1", topic_count: 1, topic0_push_offset: 0, data_bytes_hint: 32, instruction_offsets: [0, 16] }] }],
      custom_errors: [{ selector: "0x08c379a0", name: "Error", known_signature: "Error(string)", parameters: [{ name: "message", ty: "string", indexed: false }], confidence: 0.98, evidence: [{ revert_offset: 31, selector_push_offset: 18, revert_data_bytes_hint: 4, argument_word_count: 0, instruction_offsets: [18, 31] }] }],
    },
    security: { risk_score: 0, findings: [], call_count: 0, sstore_count: 0 },
    decompiled: { pseudo_source: "contract Decompiled {}" },
    capabilities: { limitation: "Bounded reconstruction" },
    private_functions: [],
    elapsed_ms: 1.2,
  };
}

describe("embedded engine input contract", () => {
  it("normalizes hexadecimal input without altering byte order", () => {
    expect(normalizeBytecode(" 0x60 80 60 40 ")).toBe("60806040");
  });

  it("rejects malformed and incomplete hexadecimal bytecode", () => {
    expect(bytecodeValidationMessage("0x6080xz")).toMatch(/hexadecimal/i);
    expect(bytecodeValidationMessage("0x608")).toMatch(/complete pair/i);
  });

  it("enforces the embedded engine bytecode limit before native execution", () => {
    expect(bytecodeValidationMessage("60".repeat(MAX_EMBEDDED_BYTECODE_BYTES + 1))).toMatch(/exceeds/i);
  });

  it("validates structured ABI events, custom errors, and policy metadata from the embedded engine", () => {
    const report = reportFromEmbeddedEngine(nativeReport(), "0x60006000", "full", "research");
    expect(report.schemaPolicy.compatibilityMode).toBe("additive-optional");
    expect(report.abiEvents[0]).toMatchObject({ signature: "Transfer(address,address,uint256)", topic0: "0xddf252ad" });
    expect(report.abiEvents[0]?.evidence[0]).toMatchObject({ logOffset: 16, logOpcode: "LOG1" });
    expect(report.customErrors[0]).toMatchObject({ signature: "Error(string)", selector: "0x08c379a0" });
    expect(report.customErrors[0]?.evidence[0]?.revertOffset).toBe(31);
  });

  it("accepts older v2 reports without optional ABI additions while marking policy metadata as legacy", () => {
    const legacy = nativeReport();
    delete (legacy as Record<string, unknown>).schema_policy;
    delete (legacy.signatures as Record<string, unknown>).abi_events;
    delete (legacy.signatures as Record<string, unknown>).custom_errors;
    const report = reportFromEmbeddedEngine(legacy, "0x60006000", "full", "research");
    expect(report.abiEvents).toEqual([]);
    expect(report.customErrors).toEqual([]);
    expect(report.schemaPolicy.policyVersion).toBe("legacy-v2");
  });

  it("rejects unsupported report schema majors before persistence", () => {
    const incompatible = nativeReport();
    incompatible.schema_version = "hinsdale.report/v3";
    expect(() => reportFromEmbeddedEngine(incompatible, "0x60006000", "full", "research")).toThrow(/unsupported embedded engine schema/i);
  });
});
