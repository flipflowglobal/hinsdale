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
export type AbiParameter = { name: string; type: string; indexed: boolean };
export type EventEvidence = { logOffset: number; logOpcode: string; topicCount: number; topic0PushOffset: number | null; dataBytesHint: number | null; instructionOffsets: number[] };
export type ErrorEvidence = { revertOffset: number; selectorPushOffset: number | null; revertDataBytesHint: number | null; argumentWordCount: number | null; instructionOffsets: number[] };
export type RecoveredAbiEvent = { topic0: string | null; name: string; signature: string | null; parameters: AbiParameter[]; confidence: number; evidence: EventEvidence[] };
export type RecoveredCustomError = { selector: string; name: string; signature: string | null; parameters: AbiParameter[]; confidence: number; evidence: ErrorEvidence[] };
export type SchemaPolicy = { policyVersion: string; compatibilityMode: string; breakingChangeRule: string; migrationRequired: boolean };

export type AnalysisReport = {
  id: string;
  createdAt: string;
  mode: AnalysisMode;
  qualityTier: QualityTier;
  bytecode: string;
  bytecodeSha256: string;
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
  abiEvents: RecoveredAbiEvent[];
  customErrors: RecoveredCustomError[];
  schemaPolicy: SchemaPolicy;
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

function nullableString(value: unknown, name: string): string | null { return value === null ? null : string(value, name); }
function nullableNumber(value: unknown, name: string): number | null { return value === null ? null : number(value, name); }
function optionalList(value: unknown, name: string): unknown[] { return value === undefined ? [] : list(value, name); }

function riskLevel(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "elevated";
  return "low";
}

function abiParameters(value: unknown, name: string): AbiParameter[] {
  return list(value, name).map((entry, index) => {
    const parameter = record(entry, `${name}[${index}]`);
    return { name: string(parameter.name, `${name}[${index}].name`), type: string(parameter.ty, `${name}[${index}].ty`), indexed: boolean(parameter.indexed, `${name}[${index}].indexed`) };
  });
}

function integerList(value: unknown, name: string): number[] {
  return list(value, name).map((entry, index) => number(entry, `${name}[${index}]`));
}

function readSchemaPolicy(value: unknown): SchemaPolicy {
  if (value === undefined) return { policyVersion: "legacy-v2", compatibilityMode: "unspecified", breakingChangeRule: "unknown", migrationRequired: false };
  const policy = record(value, "schema_policy");
  return {
    policyVersion: string(policy.policy_version, "schema_policy.policy_version"),
    compatibilityMode: string(policy.compatibility_mode, "schema_policy.compatibility_mode"),
    breakingChangeRule: string(policy.breaking_change_rule, "schema_policy.breaking_change_rule"),
    migrationRequired: boolean(policy.migration_required, "schema_policy.migration_required"),
  };
}

function readAbiEvents(value: unknown): RecoveredAbiEvent[] {
  return optionalList(value, "signatures.abi_events").map((entry, index) => {
    const event = record(entry, `signatures.abi_events[${index}]`);
    const evidence = list(event.evidence, `signatures.abi_events[${index}].evidence`).map((item, evidenceIndex) => {
      const raw = record(item, `signatures.abi_events[${index}].evidence[${evidenceIndex}]`);
      return {
        logOffset: number(raw.log_offset, `signatures.abi_events[${index}].evidence[${evidenceIndex}].log_offset`),
        logOpcode: string(raw.log_opcode, `signatures.abi_events[${index}].evidence[${evidenceIndex}].log_opcode`),
        topicCount: number(raw.topic_count, `signatures.abi_events[${index}].evidence[${evidenceIndex}].topic_count`),
        topic0PushOffset: nullableNumber(raw.topic0_push_offset, `signatures.abi_events[${index}].evidence[${evidenceIndex}].topic0_push_offset`),
        dataBytesHint: nullableNumber(raw.data_bytes_hint, `signatures.abi_events[${index}].evidence[${evidenceIndex}].data_bytes_hint`),
        instructionOffsets: integerList(raw.instruction_offsets, `signatures.abi_events[${index}].evidence[${evidenceIndex}].instruction_offsets`),
      };
    });
    return {
      topic0: nullableString(event.topic0, `signatures.abi_events[${index}].topic0`),
      name: string(event.name, `signatures.abi_events[${index}].name`),
      signature: nullableString(event.known_signature, `signatures.abi_events[${index}].known_signature`),
      parameters: abiParameters(event.parameters, `signatures.abi_events[${index}].parameters`),
      confidence: number(event.confidence, `signatures.abi_events[${index}].confidence`),
      evidence,
    };
  });
}

function readCustomErrors(value: unknown): RecoveredCustomError[] {
  return optionalList(value, "signatures.custom_errors").map((entry, index) => {
    const error = record(entry, `signatures.custom_errors[${index}]`);
    const evidence = list(error.evidence, `signatures.custom_errors[${index}].evidence`).map((item, evidenceIndex) => {
      const raw = record(item, `signatures.custom_errors[${index}].evidence[${evidenceIndex}]`);
      return {
        revertOffset: number(raw.revert_offset, `signatures.custom_errors[${index}].evidence[${evidenceIndex}].revert_offset`),
        selectorPushOffset: nullableNumber(raw.selector_push_offset, `signatures.custom_errors[${index}].evidence[${evidenceIndex}].selector_push_offset`),
        revertDataBytesHint: nullableNumber(raw.revert_data_bytes_hint, `signatures.custom_errors[${index}].evidence[${evidenceIndex}].revert_data_bytes_hint`),
        argumentWordCount: nullableNumber(raw.argument_word_count, `signatures.custom_errors[${index}].evidence[${evidenceIndex}].argument_word_count`),
        instructionOffsets: integerList(raw.instruction_offsets, `signatures.custom_errors[${index}].evidence[${evidenceIndex}].instruction_offsets`),
      };
    });
    return {
      selector: string(error.selector, `signatures.custom_errors[${index}].selector`),
      name: string(error.name, `signatures.custom_errors[${index}].name`),
      signature: nullableString(error.known_signature, `signatures.custom_errors[${index}].known_signature`),
      parameters: abiParameters(error.parameters, `signatures.custom_errors[${index}].parameters`),
      confidence: number(error.confidence, `signatures.custom_errors[${index}].confidence`),
      evidence,
    };
  });
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
    bytecodeSha256: string(metadata.bytecode_sha256, "metadata.bytecode_sha256"),
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
    abiEvents: readAbiEvents(signatures.abi_events),
    customErrors: readCustomErrors(signatures.custom_errors),
    schemaPolicy: readSchemaPolicy(report.schema_policy),
  };
}

export function isPersistedEmbeddedReport(value: unknown): value is AnalysisReport {
  try {
    const report = record(value, "persisted report");
    return string(report.schemaVersion, "schemaVersion") === ENGINE_REPORT_SCHEMA
      && typeof report.id === "string"
      && typeof report.createdAt === "string"
      && typeof report.bytecode === "string"
      && typeof report.bytecodeSha256 === "string"
      && typeof report.pseudoSolidity === "string"
      && Array.isArray(report.findings)
      && Array.isArray(report.functions)
      && Array.isArray(report.abiEvents)
      && Array.isArray(report.customErrors)
      && typeof record(report.schemaPolicy, "schemaPolicy").policyVersion === "string";
  } catch { return false; }
}

export function formatByteCount(count: number) { return count >= 1024 ? `${(count / 1024).toFixed(1)} KB` : `${count} bytes`; }
export function formatReportTime(isoDate: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(isoDate)); }
export function riskAppearance(level: RiskLevel) {
  return { low: { label: "Low risk", color: "#47D7AC", surface: "#10362D" }, elevated: { label: "Elevated", color: "#F4B942", surface: "#3D2E10" }, high: { label: "High risk", color: "#F98254", surface: "#3A2119" }, critical: { label: "Critical", color: "#F35D5D", surface: "#3D191D" } }[level];
}
