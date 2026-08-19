package expo.modules.hinsdaleengine

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class HinsdaleEngineModule : Module() {
  private val engineExecutor = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "hinsdale-engine") }

  companion object { init { System.loadLibrary("hinsdale_bridge") } }

  private external fun nativeAnalyze(bytecodeHex: String, qualityTier: String): String
  private external fun nativeRuntimeInfo(): String

  override fun definition() = ModuleDefinition {
    Name("HinsdaleEngine")
    AsyncFunction("analyze") { bytecodeHex: String, qualityTier: String, promise: Promise ->
      engineExecutor.execute {
        try { promise.resolve(nativeAnalyze(bytecodeHex, qualityTier)) }
        catch (error: Throwable) { promise.reject("ENGINE_FAILURE", "Embedded Hinsdale analysis failed: ${error.message ?: "unknown native error"}", error) }
      }
    }
    Function("runtimeInfo") { nativeRuntimeInfo() }
    OnDestroy { engineExecutor.shutdownNow() }
  }
}
