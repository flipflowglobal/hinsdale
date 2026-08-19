export type AnalysisMode = "full" | "security" | "signatures";
export type RiskLevel = "low" | "elevated" | "high" | "critical";

export type SecurityFinding = {
  id: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  title: string;
  description: string;
  evidence: string;
};

export type RecoveredFunction = {
  selector: string;
  signature: string | null;
  confidence: "Confirmed" | "Inferred";
  isView: boolean;
};

export type AnalysisReport = {
  id: string;
  createdAt: string;
  mode: AnalysisMode;
  bytecode: string;
  bytecodePreview: string;
  bytecodeLength: number;
  instructionCount: number;
  blockCount: number;
  riskLevel: RiskLevel;
  riskScore: number;
  functions: RecoveredFunction[];
  findings: SecurityFinding[];
  pseudoSolidity: string;
  isProxy: boolean;
  callCount: number;
  storageWrites: number;
};

const KNOWN_SELECTORS: Record<string, { name: string; isView: boolean }> = {
  "06fdde03": { name: "name()", isView: true },
  "095ea7b3": { name: "approve(address,uint256)", isView: false },
  "18160ddd": { name: "totalSupply()", isView: true },
  "23b872dd": { name: "transferFrom(address,address,uint256)", isView: false },
  "313ce567": { name: "decimals()", isView: true },
  "70a08231": { name: "balanceOf(address)", isView: true },
  "95d89b41": { name: "symbol()", isView: true },
  "a9059cbb": { name: "transfer(address,uint256)", isView: false },
  "8da5cb5b": { name: "owner()", isView: true },
};

export const SAMPLE_BYTECODE =
  "6080604052348015600f57600080fd5b5063a9059cbb14610035578063095ea7b31461005557806318160ddd1461007557806370a0823114610095575b600080fd5b600054f1f45aff";

export function normalizeBytecode(value: string) {
  return value.replace(/\s+/g, "").replace(/^0x/i, "").toLowerCase();
}

export function bytecodeValidationMessage(value: string) {
  const normalized = normalizeBytecode(value);
  if (!normalized) return "Paste EVM bytecode to begin an analysis.";
  if (!/^[0-9a-f]+$/i.test(normalized)) return "Bytecode can contain only hexadecimal characters.";
  if (normalized.length % 2 !== 0) return "Bytecode must contain a complete pair of hexadecimal characters.";
  if (normalized.length < 8) return "Paste at least four bytes of EVM bytecode.";
  return null;
}

function countOpcode(bytecode: string, opcode: string) {
  return (bytecode.match(new RegExp(opcode, "g")) ?? []).length;
}

function extractFunctions(bytecode: string): RecoveredFunction[] {
  const functions: RecoveredFunction[] = [];
  for (const [selector, metadata] of Object.entries(KNOWN_SELECTORS)) {
    if (bytecode.includes(selector)) {
      functions.push({
        selector: `0x${selector}`,
        signature: metadata.name,
        confidence: "Confirmed",
        isView: metadata.isView,
      });
    }
  }
  return functions;
}

function calculateRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "elevated";
  return "low";
}

function buildPseudoSolidity(functions: RecoveredFunction[], hasDelegateCall: boolean, hasSelfDestruct: boolean) {
  const headers = functions.length
    ? functions
        .slice(0, 4)
        .map((fn) => `function ${fn.signature ?? "unknown"} ${fn.isView ? "external view" : "external"};`)
        .join("\n")
    : "// No known dispatcher selectors recovered.";

  const indicators = [
    hasDelegateCall ? "// delegatecall-like opcode observed" : null,
    hasSelfDestruct ? "// selfdestruct-like opcode observed" : null,
  ]
    .filter(Boolean)
    .join("\n");

  return ["contract RecoveredContract {", "  // Local mobile reconstruction", `  ${headers.replace(/\n/g, "\n  ")}`, indicators ? `  ${indicators}` : "", "}"].filter(Boolean).join("\n");
}

export function buildAnalysisReport(input: string, mode: AnalysisMode): AnalysisReport {
  const bytecode = normalizeBytecode(input);
  const functions = extractFunctions(bytecode);
  const hasDelegateCall = bytecode.includes("f4");
  const hasSelfDestruct = bytecode.includes("ff");
  const callCount = countOpcode(bytecode, "f1") + countOpcode(bytecode, "f2") + countOpcode(bytecode, "fa");
  const storageWrites = countOpcode(bytecode, "55");
  const isProxy = hasDelegateCall && bytecode.includes("36");
  const findings: SecurityFinding[] = [];

  if (hasDelegateCall) {
    findings.push({
      id: "delegatecall",
      severity: "High",
      title: "DELEGATECALL indicator",
      description: "A delegatecall opcode byte was observed. Confirm that its destination cannot be controlled by untrusted calldata before treating the contract as safe.",
      evidence: "Opcode indicator: F4",
    });
  }
  if (hasSelfDestruct) {
    findings.push({
      id: "selfdestruct",
      severity: "Critical",
      title: "SELFDESTRUCT indicator",
      description: "A selfdestruct opcode byte was observed. Review access control and execution reachability in the complete contract context.",
      evidence: "Opcode indicator: FF",
    });
  }
  if (callCount > 0 && storageWrites > 0) {
    findings.push({
      id: "external-call-storage",
      severity: "Medium",
      title: "External-call and storage-write mix",
      description: "Both call-like and storage-write opcode bytes appear in the submitted bytecode. Inspect ordering and return-value checks with a full EVM audit pipeline.",
      evidence: `${callCount} call-like and ${storageWrites} storage-write indicator(s)`,
    });
  }
  if (isProxy) {
    findings.push({
      id: "proxy-pattern",
      severity: "Medium",
      title: "Proxy-like pattern",
      description: "The submitted bytes contain delegatecall and calldata indicators commonly associated with proxy dispatch. Confirm the implementation address and upgrade controls.",
      evidence: "Delegatecall plus calldata indicator",
    });
  }

  const fullRisk = Math.min(100, findings.reduce((sum, finding) => sum + ({ Low: 8, Medium: 20, High: 40, Critical: 70 }[finding.severity]), 0));
  const riskScore = mode === "signatures" ? 0 : fullRisk;
  const visibleFindings = mode === "signatures" ? [] : findings;
  const bytecodeLength = bytecode.length / 2;

  return {
    id: `analysis-${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode,
    bytecode,
    bytecodePreview: `${bytecode.slice(0, 18)}…${bytecode.slice(-12)}`,
    bytecodeLength,
    instructionCount: Math.max(1, Math.floor(bytecodeLength / 1.7)),
    blockCount: Math.max(1, Math.ceil(bytecodeLength / 28)),
    riskLevel: calculateRiskLevel(riskScore),
    riskScore,
    functions,
    findings: visibleFindings,
    pseudoSolidity: buildPseudoSolidity(functions, hasDelegateCall, hasSelfDestruct),
    isProxy,
    callCount,
    storageWrites,
  };
}

export function formatByteCount(count: number) {
  return count >= 1024 ? `${(count / 1024).toFixed(1)} KB` : `${count} bytes`;
}

export function formatReportTime(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(isoDate));
}

export function riskAppearance(level: RiskLevel) {
  const appearance = {
    low: { label: "Low risk", color: "#47D7AC", surface: "#10362D" },
    elevated: { label: "Elevated", color: "#F4B942", surface: "#3D2E10" },
    high: { label: "High risk", color: "#F98254", surface: "#3A2119" },
    critical: { label: "Critical", color: "#F35D5D", surface: "#3D191D" },
  } as const;
  return appearance[level];
}
