#include <jni.h>

extern "C" {
char* hins_analyze_enveloped_json(const char* hex, const char* tier);
void hins_free_str(char* value);
const char* hins_mobile_runtime_info(void);
}

extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_hinsdaleengine_HinsdaleEngineModule_nativeAnalyze(JNIEnv* env, jobject, jstring bytecode_hex, jstring quality_tier) {
  const char* hex = env->GetStringUTFChars(bytecode_hex, nullptr);
  const char* tier = env->GetStringUTFChars(quality_tier, nullptr);
  if (hex == nullptr || tier == nullptr) {
    if (hex != nullptr) env->ReleaseStringUTFChars(bytecode_hex, hex);
    if (tier != nullptr) env->ReleaseStringUTFChars(quality_tier, tier);
    return env->NewStringUTF("{\"ok\":false,\"error\":{\"code\":\"ENGINE_FAILURE\",\"message\":\"Unable to read native input strings.\"}}");
  }
  char* result = hins_analyze_enveloped_json(hex, tier);
  env->ReleaseStringUTFChars(bytecode_hex, hex);
  env->ReleaseStringUTFChars(quality_tier, tier);
  if (result == nullptr) return env->NewStringUTF("{\"ok\":false,\"error\":{\"code\":\"ENGINE_FAILURE\",\"message\":\"Embedded engine returned no response.\"}}");
  jstring output = env->NewStringUTF(result);
  hins_free_str(result);
  return output;
}

extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_hinsdaleengine_HinsdaleEngineModule_nativeRuntimeInfo(JNIEnv* env, jobject) {
  const char* info = hins_mobile_runtime_info();
  return env->NewStringUTF(info == nullptr ? "{}" : info);
}
