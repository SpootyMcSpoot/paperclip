/**
 * Embedding service for Qdrant vector memory
 *
 * Supports multiple embedding providers:
 * - LiteLLM Gateway (production, via LITELLM_BASE_URL)
 * - OpenAI API (direct, via OPENAI_API_KEY)
 * - Local fallback (development only)
 */

interface EmbeddingConfig {
  provider: "litellm" | "openai" | "fallback";
  baseUrl?: string;
  apiKey?: string;
  model: string;
  dimensions: number;
}

let embeddingConfig: EmbeddingConfig | null = null;
const embeddingCache = new Map<string, number[]>();
const CACHE_MAX_SIZE = 1000;

/**
 * Get embedding configuration from environment
 */
function getEmbeddingConfig(): EmbeddingConfig {
  if (embeddingConfig) {
    return embeddingConfig;
  }

  // Prefer LiteLLM Gateway (STAX deployment)
  const litellmUrl = process.env.LITELLM_BASE_URL;
  if (litellmUrl) {
    embeddingConfig = {
      provider: "litellm",
      baseUrl: litellmUrl,
      model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1536"),
    };
    return embeddingConfig;
  }

  // Fallback to OpenAI API
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    embeddingConfig = {
      provider: "openai",
      apiKey: openaiKey,
      model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1536"),
    };
    return embeddingConfig;
  }

  // Local development fallback (deterministic hash-based)
  console.warn(
    "No embedding service configured (LITELLM_BASE_URL or OPENAI_API_KEY). " +
      "Using local fallback (NOT suitable for production)."
  );
  embeddingConfig = {
    provider: "fallback",
    model: "local-fallback",
    dimensions: 1536,
  };
  return embeddingConfig;
}

/**
 * Generate embedding via LiteLLM Gateway
 */
async function generateLiteLLMEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<number[]> {
  if (!config.baseUrl) {
    throw new Error("LiteLLM baseUrl not configured");
  }

  const response = await fetch(`${config.baseUrl}/v1/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(
      `LiteLLM embedding failed: ${response.status} ${response.statusText}${error ? `: ${error}` : ""}`
    );
  }

  const data = await response.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error("LiteLLM response missing embedding data");
  }

  return data.data[0].embedding;
}

/**
 * Generate embedding via OpenAI API
 */
async function generateOpenAIEmbedding(
  text: string,
  config: EmbeddingConfig
): Promise<number[]> {
  if (!config.apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(
      `OpenAI embedding failed: ${response.status} ${response.statusText}${error ? `: ${error}` : ""}`
    );
  }

  const data = await response.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error("OpenAI response missing embedding data");
  }

  return data.data[0].embedding;
}

/**
 * Generate deterministic hash-based embedding (local development only)
 *
 * This is NOT suitable for production - it doesn't capture semantic similarity.
 * It's purely for testing the Qdrant integration without an API key.
 */
function generateFallbackEmbedding(text: string, dimensions: number): number[] {
  // Simple character-based hashing into vector space
  const vector = new Array(dimensions).fill(0);

  // Hash text into vector components
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const index = (charCode * (i + 1)) % dimensions;
    vector[index] += charCode / 1000; // Normalize
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= magnitude;
    }
  }

  return vector;
}

/**
 * Generate embedding for text with caching
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cacheKey = text.slice(0, 200); // Cache by first 200 chars
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const config = getEmbeddingConfig();

  let embedding: number[];

  try {
    switch (config.provider) {
      case "litellm":
        embedding = await generateLiteLLMEmbedding(text, config);
        break;
      case "openai":
        embedding = await generateOpenAIEmbedding(text, config);
        break;
      case "fallback":
        embedding = generateFallbackEmbedding(text, config.dimensions);
        break;
      default:
        throw new Error(`Unknown embedding provider: ${config.provider}`);
    }
  } catch (err) {
    console.error("Embedding generation failed, using fallback:", err);
    // Fall back to local embedding on error
    embedding = generateFallbackEmbedding(text, config.dimensions);
  }

  // Cache result
  if (embeddingCache.size >= CACHE_MAX_SIZE) {
    // Simple LRU: remove oldest entry
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey) {
      embeddingCache.delete(firstKey);
    }
  }
  embeddingCache.set(cacheKey, embedding);

  return embedding;
}

/**
 * Get embedding dimensions for current config
 */
export function getEmbeddingDimensions(): number {
  return getEmbeddingConfig().dimensions;
}

/**
 * Check if production embedding service is configured
 */
export function isProductionEmbeddingConfigured(): boolean {
  const config = getEmbeddingConfig();
  return config.provider !== "fallback";
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}
