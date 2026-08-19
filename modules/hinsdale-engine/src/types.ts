export type EngineQualityTier = "fast" | "precise" | "research";

export type EngineBridgeErrorCode = "INVALID_INPUT" | "INPUT_TOO_LARGE" | "INVALID_TIER" | "ENGINE_FAILURE" | "SCHEMA_MISMATCH" | "NATIVE_ENGINE_UNAVAILABLE";

export type EngineBridgeFailure = { ok: false; error: { code: EngineBridgeErrorCode; message: string } };
export type EngineBridgeSuccess = { ok: true; report: unknown };
export type EngineBridgeResponse = EngineBridgeFailure | EngineBridgeSuccess;
