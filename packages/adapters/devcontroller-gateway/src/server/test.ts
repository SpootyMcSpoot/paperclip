import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

function summarizeStatus(
  checks: AdapterEnvironmentCheck[]
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function resolveApiKey(config: Record<string, unknown>): string | null {
  const configKey = nonEmpty(config.apiKey);
  if (configKey) return configKey;

  const envKey = process.env.DEVCONTROLLER_API_KEY?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

function resolveBaseUrl(config: Record<string, unknown>): string | null {
  const configUrl = nonEmpty(config.baseUrl);
  if (configUrl) return configUrl;

  const envUrl = process.env.DEVCONTROLLER_BASE_URL?.trim();
  return envUrl && envUrl.length > 0 ? envUrl : null;
}

async function probeHealthEndpoint(
  baseUrl: string,
  apiKey: string | null
): Promise<{ ok: boolean; version?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/health`, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return { ok: false };

    const body = (await response.json()) as Record<string, unknown>;
    return {
      ok: true,
      version: typeof body.version === "string" ? body.version : undefined,
    };
  } catch {
    return { ok: false };
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const baseUrl = resolveBaseUrl(config);

  if (!baseUrl) {
    checks.push({
      code: "devcontroller_baseurl_missing",
      level: "error",
      message: "DevController adapter requires a baseUrl.",
      hint: "Set adapterConfig.baseUrl or DEVCONTROLLER_BASE_URL env var (e.g., http://ai-dev-controller.llm.svc.cluster.local:8096).",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(baseUrl);
  } catch {
    checks.push({
      code: "devcontroller_baseurl_invalid",
      level: "error",
      message: `Invalid baseUrl: ${baseUrl}`,
      hint: "Ensure baseUrl is a valid HTTP/HTTPS URL.",
    });
  }

  if (url) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      checks.push({
        code: "devcontroller_baseurl_protocol_invalid",
        level: "error",
        message: `Unsupported protocol: ${url.protocol}`,
        hint: "Use http:// or https://.",
      });
    } else {
      checks.push({
        code: "devcontroller_baseurl_valid",
        level: "info",
        message: `Configured AI Dev Controller URL: ${baseUrl}`,
      });
    }
  }

  const apiKey = resolveApiKey(config);
  if (apiKey) {
    checks.push({
      code: "devcontroller_apikey_present",
      level: "info",
      message: "API key is configured.",
    });
  } else {
    checks.push({
      code: "devcontroller_apikey_missing",
      level: "info",
      message: "No API key configured (AI Dev Controller may not require one in-cluster).",
    });
  }

  const escalationMode = asString(config.escalationMode, "internal");
  if (escalationMode !== "internal" && escalationMode !== "staple") {
    checks.push({
      code: "devcontroller_escalation_mode_invalid",
      level: "warn",
      message: `Unknown escalationMode "${escalationMode}". Expected "internal" or "staple".`,
    });
  }

  if (url && (url.protocol === "http:" || url.protocol === "https:")) {
    const probe = await probeHealthEndpoint(baseUrl, apiKey);
    if (probe.ok) {
      checks.push({
        code: "devcontroller_probe_ok",
        level: "info",
        message: `AI Dev Controller is reachable.${probe.version ? ` Version: ${probe.version}` : ""}`,
      });
    } else {
      checks.push({
        code: "devcontroller_probe_failed",
        level: "warn",
        message: "Failed to reach AI Dev Controller /health endpoint.",
        hint: "Verify the service is running and accessible from the Staple server.",
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
