import ExpoModulesCore

@_silgen_name("hins_analyze_enveloped_json")
private func hinsAnalyzeEnvelopedJson(_ hex: UnsafePointer<CChar>, _ tier: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>?

@_silgen_name("hins_free_str")
private func hinsFreeString(_ value: UnsafeMutablePointer<CChar>)

@_silgen_name("hins_mobile_runtime_info")
private func hinsMobileRuntimeInfo() -> UnsafePointer<CChar>?

public class HinsdaleEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HinsdaleEngine")
    AsyncFunction("analyze") { (bytecodeHex: String, qualityTier: String) -> String in
      return bytecodeHex.withCString { hexPointer in
        qualityTier.withCString { tierPointer in
          guard let response = hinsAnalyzeEnvelopedJson(hexPointer, tierPointer) else {
            return "{\"ok\":false,\"error\":{\"code\":\"ENGINE_FAILURE\",\"message\":\"Embedded engine returned no response.\"}}"
          }
          defer { hinsFreeString(response) }
          return String(cString: response)
        }
      }
    }
    Function("runtimeInfo") {
      guard let response = hinsMobileRuntimeInfo() else { return "{}" }
      return String(cString: response)
    }
  }
}
