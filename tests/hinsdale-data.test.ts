import { describe, expect, it } from "vitest";

import { MAX_EMBEDDED_BYTECODE_BYTES, bytecodeValidationMessage, normalizeBytecode } from "../lib/hinsdale-data";

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
});
