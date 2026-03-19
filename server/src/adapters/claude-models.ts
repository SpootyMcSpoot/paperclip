import type { AdapterModel } from "./types.js";
import { models as claudeFallbackModels } from "@paperclipai/adapter-claude-local";
import { readConfigFile } from "../config-file.js";

const ANTHROPIC_MODELS_ENDPOINT = "https://api.anthropic.com/v1/models";
const ANTHROPIC_MODELS_TIMEOUT_MS = 5000;
const ANTHROPIC_MODELS_CACHE_TTL_MS = 60_000;

let cached: {
  keyFingerprint: string;
  expiresAt: number;
  models: AdapterModel[];
} | null = null;

function fingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
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
  return deduped;
}

function mergedWithFallback(models: AdapterModel[]): AdapterModel[] {
  return dedupeModels([...models, ...claudeFallbackModels]).sort((a, b) =>
    a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" })
  );
}

function resolveAnthropicApiKey(): string | null {
  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envKey) return envKey;

  const config = readConfigFile();
  if (config?.llm?.provider !== "claude") return null;
  const configKey = config.llm.apiKey?.trim();
  return configKey && configKey.length > 0 ? configKey : null;
}

async function fetchAnthropicModels(apiKey: string): Promise<AdapterModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ANTHROPIC_MODELS_TIMEOUT_MS
  );
  try {
    const response = await fetch(ANTHROPIC_MODELS_ENDPOINT, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
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

export async function listClaudeModels(): Promise<AdapterModel[]> {
  const apiKey = resolveAnthropicApiKey();
  const fallback = dedupeModels(claudeFallbackModels);
  if (!apiKey) return fallback;

  const now = Date.now();
  const keyFingerprint = fingerprint(apiKey);
  if (
    cached &&
    cached.keyFingerprint === keyFingerprint &&
    cached.expiresAt > now
  ) {
    return cached.models;
  }

  const fetched = await fetchAnthropicModels(apiKey);
  if (fetched.length > 0) {
    const merged = mergedWithFallback(fetched);
    cached = {
      keyFingerprint,
      expiresAt: now + ANTHROPIC_MODELS_CACHE_TTL_MS,
      models: merged,
    };
    return merged;
  }

  if (
    cached &&
    cached.keyFingerprint === keyFingerprint &&
    cached.models.length > 0
  ) {
    return cached.models;
  }

  return fallback;
}

export function resetClaudeModelsCacheForTests() {
  cached = null;
}
