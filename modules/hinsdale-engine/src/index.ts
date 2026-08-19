import { getNativeEngineModule } from "./HinsdaleEngineModule";
import type { EngineBridgeResponse, EngineQualityTier } from "./types";

export { NativeEngineUnavailableError } from "./HinsdaleEngineModule";
export type { EngineBridgeErrorCode, EngineBridgeResponse, EngineQualityTier } from "./types";

export async function analyzeEmbeddedBytecode(bytecodeHex: string, qualityTier: EngineQualityTier): Promise<EngineBridgeResponse> {
  const raw = await getNativeEngineModule().analyze(bytecodeHex, qualityTier);
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { throw new Error("Embedded engine returned malformed JSON."); }
  if (!decoded || typeof decoded !== "object" || !("ok" in decoded) || typeof (decoded as { ok?: unknown }).ok !== "boolean") {
    throw new Error("Embedded engine response does not satisfy the bridge contract.");
  }
  return decoded as EngineBridgeResponse;
}

export function embeddedEngineRuntimeInfo() {
  const raw = getNativeEngineModule().runtimeInfo();
  return JSON.parse(raw) as { version: string; schemaVersion: string; maxInputBytes: number };
}
