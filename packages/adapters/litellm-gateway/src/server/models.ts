import { parseObject } from "@paperclipai/adapter-utils/server-utils";

type AdapterModel = { id: string; label: string };

const MODELS_ENDPOINT_PATH = "/v1/models";
const MODELS_TIMEOUT_MS = 5000;
const MODELS_CACHE_TTL_MS = 60_000;

let cached: {
  baseUrlFingerprint: string;
  expiresAt: number;
  models: AdapterModel[];
} | null = null;

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value as Record<string, unknown>;
}

function baseUrlFingerprint(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return `${url.hostname}:${
      url.port || (url.protocol === "https:" ? "443" : "80")
    }`;
  } catch {
    return baseUrl.slice(0, 50);
  }
}

function resolveLiteLLMApiKey(config: Record<string, unknown>): string | null {
  const configKey = nonEmpty(config.apiKey);
  if (configKey) return configKey;

  const envKey = process.env.LITELLM_API_KEY?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped.sort((a, b) =>
    a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" })
  );
}

async function fetchLiteLLMModels(
  baseUrl: string,
  apiKey: string | null
): Promise<AdapterModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}${MODELS_ENDPOINT_PATH}`, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as { data?: unknown };
    const data = Array.isArray(payload.data) ? payload.data : [];
    const models: AdapterModel[] = [];

    for (const item of data) {
      if (typeof item !== "object" || item === null) continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== "string" || id.trim().length === 0) continue;
      models.push({ id, label: id });
    }

    return dedupeModels(models);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function listLiteLLMModels(
  config: unknown
): Promise<AdapterModel[]> {
  const configRecord = parseObject(config);
  const baseUrl = nonEmpty(configRecord.baseUrl);

  if (!baseUrl) return [];

  const apiKey = resolveLiteLLMApiKey(configRecord);
  const now = Date.now();
  const fingerprint = baseUrlFingerprint(baseUrl);

  if (
    cached &&
    cached.baseUrlFingerprint === fingerprint &&
    cached.expiresAt > now
  ) {
    return cached.models;
  }

  const fetched = await fetchLiteLLMModels(baseUrl, apiKey);
  if (fetched.length > 0) {
    cached = {
      baseUrlFingerprint: fingerprint,
      expiresAt: now + MODELS_CACHE_TTL_MS,
      models: fetched,
    };
    return fetched;
  }

  if (
    cached &&
    cached.baseUrlFingerprint === fingerprint &&
    cached.models.length > 0
  ) {
    return cached.models;
  }

  return [];
}

export function resetLiteLLMModelsCacheForTests() {
  cached = null;
}
