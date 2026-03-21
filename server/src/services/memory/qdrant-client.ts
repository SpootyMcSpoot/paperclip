import { QdrantClient } from "@qdrant/js-client-rest";
import { readFileSync } from "fs";

let qdrantClient: QdrantClient | null = null;
let qdrantApiKey: string | null = null;

/**
 * Get Qdrant configuration from environment
 */
function getQdrantConfig() {
  const host = process.env.QDRANT_HOST || "localhost";
  const port = parseInt(process.env.QDRANT_PORT || "6333");
  const url = process.env.QDRANT_URL || `http://${host}:${port}`;

  return { url, host, port };
}

/**
 * Get Qdrant API key from secret file or environment
 */
function getQdrantApiKey(): string | undefined {
  if (qdrantApiKey) {
    return qdrantApiKey;
  }

  // Try to read from mounted secret file (Kubernetes pattern)
  const apiKeyPath = process.env.QDRANT_API_KEY_PATH;
  if (apiKeyPath) {
    try {
      qdrantApiKey = readFileSync(apiKeyPath, "utf-8").trim();
      return qdrantApiKey;
    } catch (err) {
      // Ignore - will fall back to environment variable
    }
  }

  // Fall back to environment variable
  const envKey = process.env.QDRANT_API_KEY;
  if (envKey) {
    qdrantApiKey = envKey;
    return qdrantApiKey;
  }

  return undefined;
}

/**
 * Get or create Qdrant client instance
 *
 * Configuration via environment variables:
 * - QDRANT_URL: Full URL (e.g., http://localhost:6333)
 * - QDRANT_HOST: Hostname (default: localhost)
 * - QDRANT_PORT: Port (default: 6333)
 * - QDRANT_API_KEY: API key for authentication
 * - QDRANT_API_KEY_PATH: Path to secret file containing API key
 */
export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const config = getQdrantConfig();
    const apiKey = getQdrantApiKey();

    qdrantClient = new QdrantClient({
      url: config.url,
      apiKey,
    });
  }

  return qdrantClient;
}

/**
 * Generate collection name for a company
 *
 * Sanitizes company ID to valid Qdrant collection name:
 * - Replaces hyphens with underscores
 * - Prefixes with "company_"
 */
export function getCompanyCollectionName(companyId: string): string {
  return `company_${companyId.replace(/-/g, "_")}`;
}

/**
 * Health check for Qdrant connection
 *
 * @returns true if Qdrant is accessible, false otherwise
 */
export async function checkQdrantHealth(): Promise<boolean> {
  try {
    const client = getQdrantClient();
    await client.getCollections();
    return true;
  } catch (err) {
    console.error("Qdrant health check failed:", err);
    return false;
  }
}

/**
 * Check if Qdrant is configured
 *
 * @returns true if QDRANT_URL or QDRANT_HOST is set
 */
export function isQdrantConfigured(): boolean {
  return !!(process.env.QDRANT_URL || process.env.QDRANT_HOST);
}
