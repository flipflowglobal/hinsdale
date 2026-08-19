import { analyzeEmbeddedBytecode, NativeEngineUnavailableError } from "@/modules/hinsdale-engine/src";
import { bytecodeValidationMessage, reportFromEmbeddedEngine, type AnalysisMode, type AnalysisReport, type QualityTier } from "@/lib/hinsdale-data";

export class EmbeddedEngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = "EmbeddedEngineError"; this.code = code; }
}

export async function analyzeWithEmbeddedEngine(bytecode: string, mode: AnalysisMode, qualityTier: QualityTier): Promise<AnalysisReport> {
  const validationError = bytecodeValidationMessage(bytecode);
  if (validationError) throw new EmbeddedEngineError("INVALID_INPUT", validationError);
  try {
    const response = await analyzeEmbeddedBytecode(bytecode, qualityTier);
    if (!response.ok) throw new EmbeddedEngineError(response.error.code, response.error.message);
    return reportFromEmbeddedEngine(response.report, bytecode, mode, qualityTier);
  } catch (error) {
    if (error instanceof EmbeddedEngineError) throw error;
    if (error instanceof NativeEngineUnavailableError) throw new EmbeddedEngineError(error.code, error.message);
    throw new EmbeddedEngineError("ENGINE_FAILURE", error instanceof Error ? error.message : "Embedded engine failed without an error message.");
  }
}
