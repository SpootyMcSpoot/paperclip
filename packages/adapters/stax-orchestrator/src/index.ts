/**
 * STAX AI Orchestrator adapter for Paperclip
 *
 * Provides workflow execution via STAX AI Orchestrator service.
 */

export interface TaskDefinition {
  id: string;
  type:
    | "llm_completion"
    | "mcp_tool_call"
    | "rag_query"
    | "vector_search"
    | "data_transform";
  name: string;
  description?: string;
  config: Record<string, unknown>;
  depends_on?: string[];
  timeout_seconds?: number;
  retry_count?: number;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  tasks: TaskDefinition[];
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: unknown;
  error?: string;
  duration_ms?: number;
}

export interface WorkflowExecution {
  id: string;
  workflow_name: string;
  status: string;
  task_results: Record<string, TaskResult>;
  started_at?: string;
  completed_at?: string;
  error?: string | null;
}

export class OrchestratorClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ||
      process.env.STAX_ORCHESTRATOR_URL ||
      "http://ai-orchestrator.llm.svc.cluster.local:8080";
  }

  async health(): Promise<{ status: string; version: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  }

  async submitWorkflow(workflow: WorkflowDefinition): Promise<string> {
    const response = await fetch(`${this.baseUrl}/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Workflow submission failed: ${error}`);
    }

    const result = await response.json();
    return result.workflow_id;
  }

  async getWorkflow(workflowId: string): Promise<WorkflowExecution> {
    const response = await fetch(`${this.baseUrl}/workflows/${workflowId}`);

    if (!response.ok) {
      throw new Error(
        `Failed to get workflow ${workflowId}: ${response.statusText}`
      );
    }

    return response.json();
  }

  async listWorkflows(): Promise<{
    total: number;
    workflows: Array<Record<string, unknown>>;
  }> {
    const response = await fetch(`${this.baseUrl}/workflows`);

    if (!response.ok) {
      throw new Error(`Failed to list workflows: ${response.statusText}`);
    }

    return response.json();
  }

  async executeWorkflow(
    workflow: WorkflowDefinition,
    options: {
      pollInterval?: number;
      maxWait?: number;
    } = {}
  ): Promise<WorkflowExecution> {
    const { pollInterval = 1000, maxWait = 300000 } = options;

    const workflowId = await this.submitWorkflow(workflow);
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const execution = await this.getWorkflow(workflowId);

      if (execution.status === "completed" || execution.status === "failed") {
        return execution;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Workflow ${workflowId} did not complete within ${maxWait}ms`
    );
  }
}

/**
 * Helper to create code intelligence workflow using MCP CodeGraphContext
 */
export function createCodeIntelligenceWorkflow(
  query: string
): WorkflowDefinition {
  return {
    name: "code_intelligence",
    description: `Code intelligence query: ${query}`,
    tasks: [
      {
        id: "find_code",
        type: "mcp_tool_call",
        name: "Search Code",
        description: `Find code matching: ${query}`,
        config: {
          server: "codegraphcontext",
          tool: "find_code",
          arguments: { query },
        },
      },
    ],
  };
}

/**
 * Helper to create LLM completion workflow
 */
export function createLLMCompletionWorkflow(
  prompt: string,
  model: string = "qwen35-coder"
): WorkflowDefinition {
  return {
    name: "llm_completion",
    description: `LLM completion: ${prompt.substring(0, 50)}...`,
    tasks: [
      {
        id: "completion",
        type: "llm_completion",
        name: "Generate Completion",
        config: {
          model,
          prompt,
          temperature: 0.7,
        },
      },
    ],
  };
}
