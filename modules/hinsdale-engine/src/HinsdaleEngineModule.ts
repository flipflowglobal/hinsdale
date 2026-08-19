import { requireOptionalNativeModule } from "expo-modules-core";

import type { EngineQualityTier } from "./types";

type NativeHinsdaleEngineModule = {
  analyze(bytecodeHex: string, qualityTier: EngineQualityTier): Promise<string>;
  runtimeInfo(): string;
};

const nativeModule = requireOptionalNativeModule<NativeHinsdaleEngineModule>("HinsdaleEngine");

export class NativeEngineUnavailableError extends Error {
  readonly code = "NATIVE_ENGINE_UNAVAILABLE";

  constructor() {
    super("The embedded Hinsdale engine is not loaded. Install a custom development client or release build that includes the native engine module.");
    this.name = "NativeEngineUnavailableError";
  }
}

export function getNativeEngineModule() {
  if (!nativeModule) throw new NativeEngineUnavailableError();
  return nativeModule;
}
