import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  parseObject,
  ensureCommandResolvable,
  ensureAbsoluteDirectory,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";

function summarizeStatus(
  checks: AdapterEnvironmentCheck[]
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "libai");
  const cwd = asString(config.cwd, process.cwd());

  try {
    await ensureCommandResolvable(command, cwd, process.env);
    checks.push({
      code: "libai_command_found",
      level: "info",
      message: `LibAI CLI found: ${command}`,
    });
  } catch {
    checks.push({
      code: "libai_command_not_found",
      level: "error",
      message: `LibAI CLI not found: "${command}".`,
      hint: "Install with: pip install libai-cli",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  try {
    await ensureAbsoluteDirectory(cwd);
    checks.push({
      code: "libai_cwd_valid",
      level: "info",
      message: `Working directory accessible: ${cwd}`,
    });
  } catch {
    checks.push({
      code: "libai_cwd_invalid",
      level: "warn",
      message: `Working directory not accessible: ${cwd}`,
      hint: "Set adapterConfig.cwd to a valid absolute directory path.",
    });
  }

  try {
    const probeResult = await runChildProcess(
      "env-test",
      command,
      ["--version"],
      {
        cwd,
        env: {},
        timeoutSec: 10,
        graceSec: 5,
        onLog: async () => {},
      }
    );

    if (probeResult.exitCode === 0) {
      const version = probeResult.stdout.trim().split("\n")[0] ?? "";
      checks.push({
        code: "libai_probe_ok",
        level: "info",
        message: `LibAI CLI is working.${version ? ` Version: ${version}` : ""}`,
      });
    } else {
      checks.push({
        code: "libai_probe_failed",
        level: "warn",
        message: "LibAI CLI returned non-zero exit code on version check.",
        hint: "Check that libai-cli is properly installed and configured.",
      });
    }
  } catch {
    checks.push({
      code: "libai_probe_error",
      level: "warn",
      message: "Failed to probe LibAI CLI.",
      hint: "Verify the command is executable and accessible.",
    });
  }

  const model = asString(config.model, "").trim();
  if (model) {
    checks.push({
      code: "libai_model_configured",
      level: "info",
      message: `Configured model: ${model}`,
    });
  }

  const profile = asString(config.profile, "").trim();
  if (profile) {
    const validProfiles = [
      "stax-litellm",
      "stax-ollama",
      "stax-ollama-cluster",
    ];
    if (validProfiles.includes(profile)) {
      checks.push({
        code: "libai_profile_valid",
        level: "info",
        message: `STAX profile: ${profile}`,
      });
    } else {
      checks.push({
        code: "libai_profile_unknown",
        level: "warn",
        message: `Unknown STAX profile: "${profile}".`,
        hint: `Valid profiles: ${validProfiles.join(", ")}`,
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
