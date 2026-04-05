import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@stapleai/adapter-utils";
import {
  asNumber,
  asString,
  parseObject,
  renderTemplate,
} from "@stapleai/adapter-utils/server-utils";

interface DevControllerLoopStatus {
  status: string;
  iteration: number;
  max_iterations: number;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    task_type: string;
    confidence?: number;
  }>;
  cost?: {
    total_usd: number;
    budget_usd: number;
    tokens_used: number;
  };
  escalations?: Array<{
    task_id: string;
    level: number;
    reason: string;
  }>;
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

async function pollLoopStatus(params: {
  baseUrl: string;
  apiKey: string | null;
  pollInterval: number;
  maxWait: number;
  onLog: AdapterExecutionContext["onLog"];
}): Promise<DevControllerLoopStatus> {
  const startTime = Date.now();
  let lastIteration = -1;

  while (Date.now() - startTime < params.maxWait) {
    const headers: Record<string, string> = {};
    if (params.apiKey) {
      headers["Authorization"] = `Bearer ${params.apiKey}`;
    }

    const res = await fetch(`${params.baseUrl}/dev-loop/status`, { headers });
    if (!res.ok) {
      throw new Error(`Status poll failed: ${res.status} ${res.statusText}`);
    }

    const status = (await res.json()) as DevControllerLoopStatus;

    if (status.iteration !== lastIteration) {
      lastIteration = status.iteration;
      const completedTasks = status.tasks.filter(
        (t) => t.status === "completed"
      ).length;
      const failedTasks = status.tasks.filter(
        (t) => t.status === "failed"
      ).length;
      const costStr = status.cost
        ? ` cost=$${status.cost.total_usd.toFixed(4)}`
        : "";

      await params.onLog(
        "stdout",
        `[devcontroller] iteration=${status.iteration}/${status.max_iterations} ` +
          `tasks=${completedTasks}/${status.tasks.length} completed, ${failedTasks} failed${costStr}\n`
      );
    }

    if (
      status.status === "converged" ||
      status.status === "stopped" ||
      status.status === "stuck" ||
      status.status === "budget_exhausted" ||
      status.status === "idle"
    ) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, params.pollInterval));
  }

  throw new Error(
    `Dev loop did not complete within ${params.maxWait / 1000}s`
  );
}

export async function execute(
  ctx: AdapterExecutionContext
): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta } = ctx;
  const configObj = parseObject(config);
  const baseUrl = resolveBaseUrl(configObj);

  if (!baseUrl) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage:
        "DevController adapter missing baseUrl. Set config.baseUrl or DEVCONTROLLER_BASE_URL.",
      errorCode: "devcontroller_baseurl_missing",
    };
  }

  try {
    new URL(baseUrl);
  } catch {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Invalid DevController baseUrl: ${baseUrl}`,
      errorCode: "devcontroller_baseurl_invalid",
    };
  }

  const apiKey = resolveApiKey(configObj);
  const maxIterations = Math.max(1, Math.floor(asNumber(configObj.maxIterations, 10)));
  const maxCostUsd = Math.max(0, asNumber(configObj.maxCostUsd, 5.0));
  const timeoutSec = Math.max(0, Math.floor(asNumber(configObj.timeoutSec, 600)));
  const pollIntervalSec = Math.max(1, Math.floor(asNumber(configObj.pollIntervalSec, 5)));
  const qualityGates = Array.isArray(configObj.qualityGates)
    ? (configObj.qualityGates as string[])
    : ["syntax", "lint", "tests"];
  const workspace = nonEmpty(configObj.workspace);
  const branch = nonEmpty(configObj.branch);
  const autoCreatePR = configObj.autoCreatePR !== false;
  const escalationMode = asString(configObj.escalationMode, "internal");
  const strategistModel = nonEmpty(configObj.strategistModel);
  const executorModel = nonEmpty(configObj.executorModel);

  const promptTemplate = asString(
    configObj.promptTemplate,
    "{{context.taskDescription}}"
  );

  const prompt = renderTemplate(promptTemplate, {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId },
    context,
  });

  if (onMeta) {
    await onMeta({
      adapterType: "devcontroller_gateway",
      command: "devcontroller-api",
      commandArgs: [baseUrl],
      prompt,
      context,
    });
  }

  await onLog("stdout", `[devcontroller] starting loop on ${baseUrl}\n`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const startBody: Record<string, unknown> = {
    goals: [prompt],
    max_iterations: maxIterations,
    budget: { max_cost_usd: maxCostUsd },
    quality_gates: qualityGates,
    auto_create_pr: autoCreatePR,
    metadata: {
      staple_run_id: runId,
      staple_agent_id: agent.id,
      staple_company_id: agent.companyId,
      escalation_mode: escalationMode,
    },
  };

  if (workspace) startBody.workspace = workspace;
  if (branch) startBody.branch = branch;
  if (strategistModel) startBody.strategist_model = strategistModel;
  if (executorModel) startBody.executor_model = executorModel;

  try {
    const startRes = await fetch(`${baseUrl}/dev-loop/start`, {
      method: "POST",
      headers,
      body: JSON.stringify(startBody),
    });

    if (!startRes.ok) {
      const errorText = await startRes.text().catch(() => "");
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Failed to start dev loop: ${startRes.status} ${startRes.statusText}${errorText ? `: ${errorText}` : ""}`,
        errorCode: "devcontroller_start_failed",
      };
    }

    await onLog("stdout", `[devcontroller] loop started, polling status...\n`);

    const finalStatus = await pollLoopStatus({
      baseUrl,
      apiKey,
      pollInterval: pollIntervalSec * 1000,
      maxWait: timeoutSec * 1000,
      onLog,
    });

    const completedTasks = finalStatus.tasks.filter(
      (t) => t.status === "completed"
    );
    const failedTasks = finalStatus.tasks.filter(
      (t) => t.status === "failed"
    );
    const escalations = finalStatus.escalations ?? [];

    const summaryParts: string[] = [
      `Loop ${finalStatus.status} after ${finalStatus.iteration} iterations.`,
      `Tasks: ${completedTasks.length} completed, ${failedTasks.length} failed of ${finalStatus.tasks.length} total.`,
    ];

    if (finalStatus.cost) {
      summaryParts.push(
        `Cost: $${finalStatus.cost.total_usd.toFixed(4)} / $${finalStatus.cost.budget_usd.toFixed(2)} budget. Tokens: ${finalStatus.cost.tokens_used}.`
      );
    }

    if (escalations.length > 0) {
      summaryParts.push(
        `Escalations: ${escalations.length} (${escalations.map((e) => `${e.task_id}@L${e.level}`).join(", ")})`
      );
    }

    if (failedTasks.length > 0) {
      summaryParts.push(
        "Failed tasks: " +
          failedTasks.map((t) => `${t.id}: ${t.title}`).join("; ")
      );
    }

    const summary = summaryParts.join("\n");
    await onLog("stdout", `\n[devcontroller] ${summary}\n`);

    const isSuccess =
      finalStatus.status === "converged" && failedTasks.length === 0;

    return {
      exitCode: isSuccess ? 0 : 1,
      signal: null,
      timedOut: false,
      provider: "ai-dev-controller",
      model: executorModel ?? null,
      usage: finalStatus.cost
        ? {
            inputTokens: Math.floor(finalStatus.cost.tokens_used * 0.7),
            outputTokens: Math.floor(finalStatus.cost.tokens_used * 0.3),
          }
        : undefined,
      costUsd: finalStatus.cost?.total_usd ?? null,
      billingType: "api",
      summary,
      resultJson: {
        status: finalStatus.status,
        iteration: finalStatus.iteration,
        tasks: finalStatus.tasks,
        escalations,
        cost: finalStatus.cost,
      },
      ...(isSuccess ? {} : {
        errorMessage: `Loop ended with status: ${finalStatus.status}`,
        errorCode: `devcontroller_loop_${finalStatus.status}`,
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut =
      message.includes("did not complete") || message.includes("timeout");

    await onLog("stderr", `[devcontroller] error: ${message}\n`);

    return {
      exitCode: 1,
      signal: null,
      timedOut,
      errorMessage: message,
      errorCode: timedOut
        ? "devcontroller_timeout"
        : "devcontroller_request_failed",
    };
  }
}
