import { Langfuse } from "langfuse";
import { readFileSync } from "fs";

let langfuseClient: Langfuse | null = null;

/**
 * Get Langfuse configuration from environment
 */
function getLangfuseConfig() {
  const host = process.env.LANGFUSE_HOST || "localhost";
  const port = process.env.LANGFUSE_PORT || "3000";
  const baseUrl = process.env.LANGFUSE_BASE_URL || `http://${host}:${port}`;

  return { baseUrl, host, port };
}

/**
 * Get Langfuse keys from secret files or environment
 */
function getLangfuseKeys(): { publicKey?: string; secretKey?: string } {
  // Try to read from mounted secret files (Kubernetes pattern)
  const publicKeyPath = process.env.LANGFUSE_PUBLIC_KEY_PATH;
  const secretKeyPath = process.env.LANGFUSE_SECRET_KEY_PATH;

  let publicKey: string | undefined;
  let secretKey: string | undefined;

  if (publicKeyPath) {
    try {
      publicKey = readFileSync(publicKeyPath, "utf-8").trim();
    } catch (err) {
      // Ignore - will fall back to environment variable
    }
  }

  if (secretKeyPath) {
    try {
      secretKey = readFileSync(secretKeyPath, "utf-8").trim();
    } catch (err) {
      // Ignore - will fall back to environment variable
    }
  }

  // Fall back to environment variables
  if (!publicKey) {
    publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  }

  if (!secretKey) {
    secretKey = process.env.LANGFUSE_SECRET_KEY;
  }

  return { publicKey, secretKey };
}

/**
 * Get or create Langfuse client instance
 *
 * Configuration via environment variables:
 * - LANGFUSE_BASE_URL: Full URL (e.g., http://localhost:3000)
 * - LANGFUSE_HOST: Hostname (default: localhost)
 * - LANGFUSE_PORT: Port (default: 3000)
 * - LANGFUSE_PUBLIC_KEY: Public API key
 * - LANGFUSE_SECRET_KEY: Secret API key
 * - LANGFUSE_PUBLIC_KEY_PATH: Path to public key file
 * - LANGFUSE_SECRET_KEY_PATH: Path to secret key file
 */
export function getLangfuseClient(): Langfuse | null {
  if (!isLangfuseConfigured()) {
    return null;
  }

  if (!langfuseClient) {
    const config = getLangfuseConfig();
    const keys = getLangfuseKeys();

    if (!keys.publicKey || !keys.secretKey) {
      console.warn(
        "Langfuse configured but missing keys. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.",
      );
      return null;
    }

    langfuseClient = new Langfuse({
      baseUrl: config.baseUrl,
      publicKey: keys.publicKey,
      secretKey: keys.secretKey,
      flushAt: 10, // Flush after 10 events
      flushInterval: 1000, // Flush every 1 second
    });
  }

  return langfuseClient;
}

/**
 * Check if Langfuse is configured
 *
 * @returns true if LANGFUSE_BASE_URL, LANGFUSE_HOST, or keys are set
 */
export function isLangfuseConfigured(): boolean {
  return !!(
    process.env.LANGFUSE_BASE_URL ||
    process.env.LANGFUSE_HOST ||
    process.env.LANGFUSE_PUBLIC_KEY ||
    process.env.LANGFUSE_PUBLIC_KEY_PATH
  );
}

/**
 * Flush pending traces and shut down Langfuse client
 */
export async function shutdownLangfuse(): Promise<void> {
  if (langfuseClient) {
    await langfuseClient.shutdownAsync();
    langfuseClient = null;
  }
}

/**
 * Health check for Langfuse connection
 *
 * @returns true if Langfuse is accessible, false otherwise
 */
export async function checkLangfuseHealth(): Promise<boolean> {
  const config = getLangfuseConfig();

  try {
    const response = await fetch(`${config.baseUrl}/api/public/health`);
    return response.ok;
  } catch (err) {
    console.error("Langfuse health check failed:", err);
    return false;
  }
}
