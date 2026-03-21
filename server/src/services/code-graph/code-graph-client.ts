/**
 * Code Graph service client
 *
 * Provides semantic code analysis beyond text search using
 * graph-based code understanding (AST, call graphs, dependencies)
 */

export interface CodeGraphConfig {
  baseUrl: string;
  timeout: number;
}

/**
 * Code analysis request
 */
export interface CodeAnalysisRequest {
  repoUrl: string;
  branch?: string;
  commit?: string;
  paths?: string[];
}

/**
 * Function definition
 */
export interface FunctionDefinition {
  name: string;
  file: string;
  line: number;
  signature: string;
  docstring?: string;
  language: string;
}

/**
 * Dependency relationship
 */
export interface Dependency {
  source: string;
  target: string;
  type: "import" | "call" | "inherit" | "use";
  location: {
    file: string;
    line: number;
  };
}

/**
 * Call graph node
 */
export interface CallGraphNode {
  function: string;
  file: string;
  callers: string[];
  callees: string[];
}

let codeGraphConfig: CodeGraphConfig | null = null;

/**
 * Get Code Graph configuration from environment
 */
function getCodeGraphConfig(): CodeGraphConfig {
  if (codeGraphConfig) {
    return codeGraphConfig;
  }

  const baseUrl = process.env.CODE_GRAPH_URL || "http://localhost:8097";
  const timeout = parseInt(process.env.CODE_GRAPH_TIMEOUT || "30000");

  codeGraphConfig = {
    baseUrl,
    timeout,
  };

  return codeGraphConfig;
}

/**
 * Check if Code Graph is configured
 */
export function isCodeGraphConfigured(): boolean {
  return !!process.env.CODE_GRAPH_URL;
}

/**
 * Index a repository for code analysis
 *
 * @param request - Repository to index
 * @returns Indexing job ID
 */
export async function indexRepository(
  request: CodeAnalysisRequest,
): Promise<{ jobId: string } | null> {
  if (!isCodeGraphConfigured()) {
    return null;
  }

  const config = getCodeGraphConfig();

  try {
    const response = await fetch(`${config.baseUrl}/api/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      console.error(`Code Graph index failed: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error("Code Graph index error:", err);
    return null;
  }
}

/**
 * Find function definitions by name or pattern
 *
 * @param query - Function name or pattern
 * @param repoUrl - Repository URL
 * @returns Matching function definitions
 */
export async function findFunctions(
  query: string,
  repoUrl: string,
): Promise<FunctionDefinition[]> {
  if (!isCodeGraphConfigured()) {
    return [];
  }

  const config = getCodeGraphConfig();

  try {
    const params = new URLSearchParams({
      query,
      repo: repoUrl,
    });

    const response = await fetch(`${config.baseUrl}/api/functions?${params}`, {
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      console.error(`Code Graph function search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.functions || [];
  } catch (err) {
    console.error("Code Graph function search error:", err);
    return [];
  }
}

/**
 * Find all callers of a function
 *
 * @param functionName - Function to find callers for
 * @param repoUrl - Repository URL
 * @returns List of functions that call this function
 */
export async function findCallers(
  functionName: string,
  repoUrl: string,
): Promise<CallGraphNode[]> {
  if (!isCodeGraphConfigured()) {
    return [];
  }

  const config = getCodeGraphConfig();

  try {
    const params = new URLSearchParams({
      function: functionName,
      repo: repoUrl,
    });

    const response = await fetch(`${config.baseUrl}/api/callers?${params}`, {
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      console.error(`Code Graph callers search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.callers || [];
  } catch (err) {
    console.error("Code Graph callers search error:", err);
    return [];
  }
}

/**
 * Find all functions called by a function
 *
 * @param functionName - Function to find callees for
 * @param repoUrl - Repository URL
 * @returns List of functions called by this function
 */
export async function findCallees(
  functionName: string,
  repoUrl: string,
): Promise<CallGraphNode[]> {
  if (!isCodeGraphConfigured()) {
    return [];
  }

  const config = getCodeGraphConfig();

  try {
    const params = new URLSearchParams({
      function: functionName,
      repo: repoUrl,
    });

    const response = await fetch(`${config.baseUrl}/api/callees?${params}`, {
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      console.error(`Code Graph callees search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.callees || [];
  } catch (err) {
    console.error("Code Graph callees search error:", err);
    return [];
  }
}

/**
 * Get dependency graph for a file or module
 *
 * @param path - File or module path
 * @param repoUrl - Repository URL
 * @returns Dependency relationships
 */
export async function getDependencies(
  path: string,
  repoUrl: string,
): Promise<Dependency[]> {
  if (!isCodeGraphConfigured()) {
    return [];
  }

  const config = getCodeGraphConfig();

  try {
    const params = new URLSearchParams({
      path,
      repo: repoUrl,
    });

    const response = await fetch(`${config.baseUrl}/api/dependencies?${params}`, {
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      console.error(`Code Graph dependencies failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.dependencies || [];
  } catch (err) {
    console.error("Code Graph dependencies error:", err);
    return [];
  }
}

/**
 * Find files affected by changing a function or module
 *
 * @param target - Function or module name
 * @param repoUrl - Repository URL
 * @returns List of affected files
 */
export async function findImpactedFiles(
  target: string,
  repoUrl: string,
): Promise<string[]> {
  if (!isCodeGraphConfigured()) {
    return [];
  }

  const config = getCodeGraphConfig();

  try {
    const params = new URLSearchParams({
      target,
      repo: repoUrl,
    });

    const response = await fetch(`${config.baseUrl}/api/impact?${params}`, {
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!response.ok) {
      console.error(`Code Graph impact analysis failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.files || [];
  } catch (err) {
    console.error("Code Graph impact analysis error:", err);
    return [];
  }
}

/**
 * Health check for Code Graph service
 */
export async function checkCodeGraphHealth(): Promise<boolean> {
  const config = getCodeGraphConfig();

  try {
    const response = await fetch(`${config.baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (err) {
    console.error("Code Graph health check failed:", err);
    return false;
  }
}
