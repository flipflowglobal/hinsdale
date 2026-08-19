import { describe, expect, it } from "vitest";

import { SAMPLE_BYTECODE, buildAnalysisReport, bytecodeValidationMessage, normalizeBytecode } from "../lib/hinsdale-data";

describe("Hinsdale local analysis model", () => {
  it("normalizes common bytecode input formats", () => {
    expect(normalizeBytecode(" 0x60 80 60 40 ")).toBe("60806040");
  });

  it("rejects malformed bytecode before analysis", () => {
    expect(bytecodeValidationMessage("0x6080xz")).toMatch(/hexadecimal/i);
    expect(bytecodeValidationMessage("0x608")).toMatch(/complete pair/i);
  });

  it("recovers known selectors and reports security indicators", () => {
    const report = buildAnalysisReport(SAMPLE_BYTECODE, "full");
    expect(report.functions.map((item) => item.signature)).toContain("transfer(address,uint256)");
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.riskScore).toBeGreaterThan(0);
  });

  it("suppresses security findings in signatures-only mode", () => {
    const report = buildAnalysisReport(SAMPLE_BYTECODE, "signatures");
    expect(report.findings).toHaveLength(0);
    expect(report.riskScore).toBe(0);
  });
});
