export type AnalysisMode = "full" | "security" | "signatures";
export type RiskLevel = "low" | "elevated" | "high" | "critical";
export type QualityTier = "fast" | "precise" | "research";

export const ENGINE_REPORT_SCHEMA = "hinsdale.report/v2";
export const MAX_EMBEDDED_BYTECODE_BYTES = 512 * 1024;

export const QUALITY_TIER_DETAILS: Record<QualityTier, { label: string; status: string; summary: string; capabilities: string[] }> = {
  fast: { label: "Fast", status: "Embedded native engine", summary: "Bounded on-device triage with explicit unresolved control flow.", capabilities: ["Disassembly", "CFG summary", "Signature recovery", "Security report"] },
  precise: { label: "Precise", status: "Embedded native engine", summary: "Expanded on-device reconstruction with bounded context and merged state.", capabilities: ["Contextual CFG", "Private candidates", "Merged symbolic state", "Storage evidence"] },
  research: { label: "Research", status: "Embedded native engine", summary: "Higher bounded exploration for difficult bytecode; verify all inferred output.", capabilities: ["Increased block visits", "Path evidence", "Mapping candidates", "Experimental observations"] },
};

export type SecurityFinding = { id: string; severity: string; title: string; description: string; evidence: string };
export type RecoveredFunction = { selector: string; signature: string | null; confidence: string; isView: boolean };

export type AnalysisReport = {
  id: string;
  createdAt: string;
  mode: AnalysisMode;
  qualityTier: QualityTier;
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
  schemaVersion: string;
  elapsedMs: number;
  limitations: string;
  privateFunctionCandidateCount: number;
};

type JsonRecord = Record<string, unknown>;

export class EngineReportValidationError extends Error {
  constructor(message: string) { super(message); this.name = "EngineReportValidationError"; }
}

export function normalizeBytecode(value: string) {
  return value.replace(/\s+/g, "").replace(/^0x/i, "").toLowerCase();
}

export function bytecodeValidationMessage(value: string) {
  const normalized = normalizeBytecode(value);
  if (!normalized) return "Paste EVM bytecode to begin an analysis.";
  if (!/^[0-9a-f]+$/i.test(normalized)) return "Bytecode can contain only hexadecimal characters.";
  if (normalized.length % 2 !== 0) return "Bytecode must contain a complete pair of hexadecimal characters.";
  if (normalized.length < 8) return "Paste at least four bytes of EVM bytecode.";
  if (normalized.length / 2 > MAX_EMBEDDED_BYTECODE_BYTES) return `Bytecode exceeds the ${MAX_EMBEDDED_BYTECODE_BYTES} byte on-device limit.`;
  return null;
}

function record(value: unknown, name: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EngineReportValidationError(`Embedded engine report is missing ${name}.`);
  return value as JsonRecord;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string") throw new EngineReportValidationError(`Embedded engine report contains an invalid ${name}.`);
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new EngineReportValidationError(`Embedded engine report contains an invalid ${name}.`);
  return value;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new EngineReportValidationError(`Embedded engine report contains an invalid ${name}.`);
  return value;
}

function list(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new EngineReportValidationError(`Embedded engine report contains an invalid ${name}.`);
  return value;
}

function riskLevel(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "elevated";
  return "low";
}

export function reportFromEmbeddedEngine(raw: unknown, bytecode: string, mode: AnalysisMode, qualityTier: QualityTier): AnalysisReport {
  const report = record(raw, "root object");
  const schemaVersion = string(report.schema_version, "schema_version");
  if (schemaVersion !== ENGINE_REPORT_SCHEMA) throw new EngineReportValidationError(`Unsupported embedded engine schema ${schemaVersion}.`);
  const metadata = record(report.metadata, "metadata");
  const disassembly = record(report.disassembly, "disassembly");
  const cfg = record(report.cfg_summary, "cfg_summary");
  const signatures = record(report.signatures, "signatures");
  const security = record(report.security, "security");
  const decompiled = record(report.decompiled, "decompiled");
  const capabilities = record(report.capabilities, "capabilities");

  const functions = list(signatures.functions, "signatures.functions").map((entry, index) => {
    const fn = record(entry, `signatures.functions[${index}]`);
    const knownName = fn.known_name === null ? null : string(fn.known_name, `signatures.functions[${index}].known_name`);
    return { selector: string(fn.selector, `signatures.functions[${index}].selector`), signature: knownName, confidence: knownName ? "Known signature" : "Unlabelled selector", isView: boolean(fn.is_view, `signatures.functions[${index}].is_view`) };
  });
  const findings = list(security.findings, "security.findings").map((entry, index) => {
    const finding = record(entry, `security.findings[${index}]`);
    const offset = finding.offset === null ? "" : ` at 0x${number(finding.offset, `security.findings[${index}].offset`).toString(16)}`;
    return { id: `${string(finding.pattern, `security.findings[${index}].pattern`)}-${index}`, severity: string(finding.severity, `security.findings[${index}].severity`), title: string(finding.title, `security.findings[${index}].title`), description: string(finding.description, `security.findings[${index}].description`), evidence: `${string(finding.pattern, `security.findings[${index}].pattern`)}${offset}` };
  });
  const normalizedBytecode = normalizeBytecode(bytecode);
  const engineTier = string(metadata.analysis_profile, "metadata.analysis_profile") as QualityTier;
  if (engineTier !== qualityTier) throw new EngineReportValidationError("Embedded engine returned a report for a different quality tier.");

  return {
    id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(), mode, qualityTier,
    bytecode: normalizedBytecode,
    bytecodePreview: normalizedBytecode.length > 30 ? `${normalizedBytecode.slice(0, 18)}…${normalizedBytecode.slice(-12)}` : normalizedBytecode,
    bytecodeLength: number(metadata.bytecode_len, "metadata.bytecode_len"),
    instructionCount: number(disassembly.instruction_count, "disassembly.instruction_count"),
    blockCount: number(cfg.block_count, "cfg_summary.block_count"),
    riskLevel: riskLevel(number(security.risk_score, "security.risk_score")),
    riskScore: number(security.risk_score, "security.risk_score"),
    functions, findings,
    pseudoSolidity: string(decompiled.pseudo_source, "decompiled.pseudo_source"),
    isProxy: boolean(metadata.is_proxy, "metadata.is_proxy"),
    callCount: number(security.call_count, "security.call_count"),
    storageWrites: number(security.sstore_count, "security.sstore_count"),
    schemaVersion, elapsedMs: number(report.elapsed_ms, "elapsed_ms"),
    limitations: string(capabilities.limitation, "capabilities.limitation"),
    privateFunctionCandidateCount: list(report.private_functions, "private_functions").length,
  };
}

export function isPersistedEmbeddedReport(value: unknown): value is AnalysisReport {
  try {
    const report = record(value, "persisted report");
    return string(report.schemaVersion, "schemaVersion") === ENGINE_REPORT_SCHEMA
      && typeof report.id === "string"
      && typeof report.createdAt === "string"
      && typeof report.bytecode === "string"
      && typeof report.pseudoSolidity === "string"
      && Array.isArray(report.findings)
      && Array.isArray(report.functions);
  } catch { return false; }
}

export function formatByteCount(count: number) { return count >= 1024 ? `${(count / 1024).toFixed(1)} KB` : `${count} bytes`; }
export function formatReportTime(isoDate: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(isoDate)); }
export function riskAppearance(level: RiskLevel) {
  return { low: { label: "Low risk", color: "#47D7AC", surface: "#10362D" }, elevated: { label: "Elevated", color: "#F4B942", surface: "#3D2E10" }, high: { label: "High risk", color: "#F98254", surface: "#3A2119" }, critical: { label: "Critical", color: "#F35D5D", surface: "#3D191D" } }[level];
}
