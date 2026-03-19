import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  parseObject,
  renderTemplate,
} from "@paperclipai/adapter-utils/server-utils";

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

function resolveLiteLLMApiKey(config: Record<string, unknown>): string | null {
  const configKey = nonEmpty(config.apiKey);
  if (configKey) return configKey;

  const envKey = process.env.LITELLM_API_KEY?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

async function streamChatCompletion(params: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  customHeaders: Record<string, string>;
  onLog: AdapterExecutionContext["onLog"];
}): Promise<AdapterExecutionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...params.customHeaders,
    };

    if (params.apiKey) {
      headers["Authorization"] = `Bearer ${params.apiKey}`;
    }

    const requestBody = {
      model: params.model,
      messages: [{ role: "user", content: params.prompt }],
      stream: true,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
    };

    await params.onLog(
      "stdout",
      `[litellm-gateway] POST ${params.baseUrl}/v1/chat/completions model=${params.model} prompt=${params.prompt.length} chars\n`
    );

    const response = await fetch(`${params.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `LiteLLM request failed: ${response.status} ${
          response.statusText
        }${errorText ? `: ${errorText}` : ""}`,
        errorCode: "litellm_gateway_request_failed",
      };
    }

    if (!response.body) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: "LiteLLM response missing body",
        errorCode: "litellm_gateway_no_body",
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    const assistantChunks: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.slice(6);
        let chunk: unknown;
        try {
          chunk = JSON.parse(dataStr);
        } catch {
          continue;
        }

        const record = asRecord(chunk);
        if (!record) continue;

        const choices = Array.isArray(record.choices) ? record.choices : [];
        for (const choice of choices) {
          const choiceRecord = asRecord(choice);
          if (!choiceRecord) continue;

          const delta = asRecord(choiceRecord.delta);
          if (delta) {
            const content = nonEmpty(delta.content);
            if (content) {
              assistantChunks.push(content);
              await params.onLog("stdout", content);
            }
          }
        }

        const usage = asRecord(record.usage);
        if (usage) {
          inputTokens = asNumber(
            usage.prompt_tokens ?? usage.input_tokens,
            inputTokens
          );
          outputTokens = asNumber(
            usage.completion_tokens ?? usage.output_tokens,
            outputTokens
          );
          const promptTokensDetails = asRecord(usage.prompt_tokens_details);
          const cachedTokens = promptTokensDetails
            ? asNumber(promptTokensDetails.cached_tokens, 0)
            : 0;
          cachedInputTokens = asNumber(
            cachedTokens || usage.cached_input_tokens,
            cachedInputTokens
          );
        }
      }
    }

    const summary = assistantChunks.join("").trim();

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      provider: "litellm",
      model: params.model,
      usage: {
        inputTokens,
        outputTokens,
        ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
      },
      ...(summary ? { summary } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = message.includes("aborted") || message.includes("timeout");

    await params.onLog(
      "stderr",
      `[litellm-gateway] request failed: ${message}\n`
    );

    return {
      exitCode: 1,
      signal: null,
      timedOut,
      errorMessage: message,
      errorCode: timedOut
        ? "litellm_gateway_timeout"
        : "litellm_gateway_request_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function execute(
  ctx: AdapterExecutionContext
): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta } = ctx;
  const configObj = parseObject(config);
  const baseUrl = nonEmpty(configObj.baseUrl);

  if (!baseUrl) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "LiteLLM adapter missing baseUrl",
      errorCode: "litellm_gateway_baseurl_missing",
    };
  }

  try {
    new URL(baseUrl);
  } catch {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Invalid LiteLLM baseUrl: ${baseUrl}`,
      errorCode: "litellm_gateway_baseurl_invalid",
    };
  }

  const model = nonEmpty(configObj.model);
  if (!model) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "LiteLLM adapter missing model",
      errorCode: "litellm_gateway_model_missing",
    };
  }

  const promptTemplate = asString(
    configObj.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work."
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

  const apiKey = resolveLiteLLMApiKey(configObj);
  const timeoutSec = Math.max(
    0,
    Math.floor(asNumber(configObj.timeoutSec, 300))
  );
  const timeoutMs = timeoutSec > 0 ? timeoutSec * 1000 : 300_000;
  const maxTokens = Math.max(
    1,
    Math.floor(asNumber(configObj.maxTokens, 4096))
  );
  const temperature = Math.max(
    0,
    Math.min(2, asNumber(configObj.temperature, 0.7))
  );
  const customHeaders = asRecord(configObj.headers) ?? {};
  const customHeadersStringified: Record<string, string> = {};

  for (const [key, value] of Object.entries(customHeaders)) {
    if (typeof value === "string") {
      customHeadersStringified[key] = value;
    }
  }

  if (onMeta) {
    await onMeta({
      adapterType: "litellm_gateway",
      command: "litellm-proxy",
      commandArgs: [baseUrl, model],
      prompt,
      context,
    });
  }

  return await streamChatCompletion({
    baseUrl,
    apiKey,
    model,
    prompt,
    maxTokens,
    temperature,
    timeoutMs,
    customHeaders: customHeadersStringified,
    onLog,
  });
}
