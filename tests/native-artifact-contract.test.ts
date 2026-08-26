import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const androidScript = "modules/hinsdale-engine/scripts/build-android.sh";
const iosScript = "modules/hinsdale-engine/scripts/build-ios.sh";

function failureFor(script: string, env: NodeJS.ProcessEnv) {
  try {
    execFileSync("bash", [script], { env, encoding: "utf8", stdio: "pipe" });
    throw new Error("expected native build script to fail");
  } catch (error) {
    const result = error as { status?: number; stdout?: string; stderr?: string; message?: string };
    return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.message ?? ""}` };
  }
}

describe("native artifact release contract", () => {
  it("rejects Android builds before invoking Cargo when the NDK is absent", () => {
    const env = { ...process.env };
    delete env.ANDROID_NDK_HOME;
    const result = failureFor(androidScript, env);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/ANDROID_NDK_HOME/i);
  });

  it("rejects iOS builds on non-macOS runners with an actionable diagnostic", () => {
    const result = failureFor(iosScript, process.env);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/macOS.*Xcode/i);
  });
});
