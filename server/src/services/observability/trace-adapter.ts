import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import { getLangfuseClient, isLangfuseConfigured } from "./langfuse-client.js";

/**
 * Wrap adapter execution with Langfuse tracing
 *
 * @param execute - The adapter's execute function
 * @param ctx - Adapter execution context
 * @returns Wrapped execution result with tracing
 */
export async function traceAdapterExecution(
  execute: (ctx: AdapterExecutionContext) => Promise<AdapterExecutionResult>,
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  // If Langfuse is not configured, pass through without tracing
  if (!isLangfuseConfigured()) {
    return await execute(ctx);
  }

  const langfuse = getLangfuseClient();
  if (!langfuse) {
    // Langfuse configured but client failed to initialize
    return await execute(ctx);
  }

  const { runId, agent, config, context } = ctx;

  // Create trace for agent execution
  const trace = langfuse.trace({
    name: "agent-execution",
    userId: agent.id,
    sessionId: runId,
    metadata: {
      companyId: agent.companyId,
      agentId: agent.id,
      agentName: agent.name,
      agentRole: (agent as any).role || "unknown",
      runId,
      adapterType: config.type || "unknown",
    },
    tags: [(agent as any).role || "unknown", config.type || "unknown"],
  });

  // Extract model and prompt from config/context
  const configObj = typeof config === "object" && config !== null ? config : {};
  const model =
    "model" in configObj && typeof configObj.model === "string"
      ? configObj.model
      : "unknown";

  // Create generation span for LLM call
  const generation = trace.generation({
    name: "llm-completion",
    model,
    input: context, // Full context passed to agent
    metadata: {
      baseUrl:
        "baseUrl" in configObj && typeof configObj.baseUrl === "string"
          ? configObj.baseUrl
          : undefined,
      temperature:
        "temperature" in configObj && typeof configObj.temperature === "number"
          ? configObj.temperature
          : undefined,
      maxTokens:
        "maxTokens" in configObj && typeof configObj.maxTokens === "number"
          ? configObj.maxTokens
          : undefined,
    },
  });

  try {
    // Execute adapter
    const result = await execute(ctx);

    // Record result
    generation.end({
      output: result.summary || result.errorMessage || "",
      usage: result.usage
        ? {
            promptTokens: result.usage.inputTokens,
            completionTokens: result.usage.outputTokens,
            totalTokens:
              (result.usage.inputTokens || 0) +
              (result.usage.outputTokens || 0),
          }
        : undefined,
      statusMessage: result.exitCode === 0 ? "success" : "error",
      metadata: {
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        provider: result.provider,
        model: result.model,
      },
    });

    trace.update({
      output: result.summary || result.errorMessage || "",
      metadata: {
        exitCode: result.exitCode,
        success: result.exitCode === 0,
      },
    });

    // Flush traces (async, non-blocking)
    langfuse.flushAsync().catch((err) => {
      console.error("Failed to flush Langfuse traces:", err);
    });

    return result;
  } catch (err) {
    // Record error
    const errorMessage = err instanceof Error ? err.message : String(err);

    generation.end({
      output: errorMessage,
      statusMessage: "error",
      metadata: {
        error: errorMessage,
      },
    });

    trace.update({
      output: errorMessage,
      metadata: {
        error: errorMessage,
        success: false,
      },
    });

    // Flush traces (async, non-blocking)
    langfuse.flushAsync().catch((flushErr) => {
      console.error("Failed to flush Langfuse traces:", flushErr);
    });

    throw err;
  }
}

/**
 * Create a traced version of an adapter execute function
 *
 * Usage:
 * ```typescript
 * import { createTracedExecute } from "./trace-adapter.js";
 * import { execute as originalExecute } from "./execute.js";
 *
 * export const execute = createTracedExecute(originalExecute);
 * ```
 */
export function createTracedExecute(
  execute: (ctx: AdapterExecutionContext) => Promise<AdapterExecutionResult>,
): (ctx: AdapterExecutionContext) => Promise<AdapterExecutionResult> {
  return async (ctx: AdapterExecutionContext) => {
    return await traceAdapterExecution(execute, ctx);
  };
}
