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

function resolveLiteLLMApiKey(config: Record<string, unknown>): string | null {
  const configKey = nonEmpty(config.apiKey);
  if (configKey) return configKey;

  const envKey = process.env.LITELLM_API_KEY?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

async function probeModelsEndpoint(
  baseUrl: string,
  apiKey: string | null
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/v1/models`, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const baseUrl = asString(config.baseUrl, "").trim();

  if (!baseUrl) {
    checks.push({
      code: "litellm_gateway_baseurl_missing",
      level: "error",
      message: "LiteLLM adapter requires a baseUrl.",
      hint: "Set adapterConfig.baseUrl to your LiteLLM proxy URL (e.g., http://localhost:4000).",
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
      code: "litellm_gateway_baseurl_invalid",
      level: "error",
      message: `Invalid baseUrl: ${baseUrl}`,
      hint: "Ensure baseUrl is a valid HTTP/HTTPS URL.",
    });
  }

  if (url) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      checks.push({
        code: "litellm_gateway_baseurl_protocol_invalid",
        level: "error",
        message: `Unsupported baseUrl protocol: ${url.protocol}`,
        hint: "Use http:// or https://.",
      });
    } else {
      checks.push({
        code: "litellm_gateway_baseurl_valid",
        level: "info",
        message: `Configured LiteLLM base URL: ${baseUrl}`,
      });
    }
  }

  const apiKey = resolveLiteLLMApiKey(config);
  if (apiKey) {
    checks.push({
      code: "litellm_gateway_apikey_present",
      level: "info",
      message: "API key is configured.",
    });
  } else {
    checks.push({
      code: "litellm_gateway_apikey_missing",
      level: "warn",
      message: "No API key detected.",
      hint: "Set LITELLM_API_KEY env var or config.apiKey if your LiteLLM proxy requires authentication.",
    });
  }

  const model = nonEmpty(config.model);
  if (!model) {
    checks.push({
      code: "litellm_gateway_model_missing",
      level: "warn",
      message: "No model specified in config.",
      hint: "Set adapterConfig.model to a model identifier from your LiteLLM configuration.",
    });
  } else {
    checks.push({
      code: "litellm_gateway_model_present",
      level: "info",
      message: `Configured model: ${model}`,
    });
  }

  if (url && (url.protocol === "http:" || url.protocol === "https:")) {
    const probeOk = await probeModelsEndpoint(baseUrl, apiKey);
    if (probeOk) {
      checks.push({
        code: "litellm_gateway_probe_ok",
        level: "info",
        message: "Successfully reached LiteLLM /v1/models endpoint.",
      });
    } else {
      checks.push({
        code: "litellm_gateway_probe_failed",
        level: "warn",
        message: "Failed to reach LiteLLM /v1/models endpoint.",
        hint: "Verify that LiteLLM proxy is running and accessible from the Paperclip server.",
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
