import { Router, type Request, type Response } from "express";
import { badRequest } from "../errors.js";
import { logger } from "../middleware/logger.js";

const LITELLM_BASE_URL =
  process.env.LITELLM_BASE_URL ??
  process.env.OPENAI_API_BASE?.replace(/\/v1\/?$/, "") ??
  "http://litellm.llm.svc.cluster.local:4000";

const LITELLM_API_KEY =
  process.env.LITELLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "";

const DEFAULT_MODEL = process.env.LITELLM_DEFAULT_MODEL ?? "qwen35-coder";

interface ChatRequestBody {
  messages: { role: string; content: string }[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export function chatRoutes() {
  const router = Router();

  router.get("/chat/models", async (req: Request, res: Response) => {
    if (req.actor.type !== "board") {
      res.status(403).json({ error: "Board access required" });
      return;
    }

    try {
      const response = await fetch(`${LITELLM_BASE_URL}/v1/models`, {
        headers: {
          Authorization: `Bearer ${LITELLM_API_KEY}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.warn({ status: response.status, body }, "LiteLLM models endpoint failed");
        res.json({ models: [{ id: DEFAULT_MODEL, name: DEFAULT_MODEL }] });
        return;
      }

      const data = (await response.json()) as { data?: { id: string }[] };
      const models = (data.data ?? []).map((m) => ({ id: m.id, name: m.id }));
      res.json({ models, default: DEFAULT_MODEL });
    } catch (err) {
      logger.warn({ err }, "Failed to fetch LiteLLM models");
      res.json({ models: [{ id: DEFAULT_MODEL, name: DEFAULT_MODEL }], default: DEFAULT_MODEL });
    }
  });

  router.post("/chat/completions", async (req: Request, res: Response) => {
    if (req.actor.type !== "board") {
      res.status(403).json({ error: "Board access required" });
      return;
    }

    const body = req.body as ChatRequestBody;
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw badRequest("messages array is required and must not be empty");
    }

    const model = body.model ?? DEFAULT_MODEL;
    const temperature = body.temperature ?? 0.1;
    const maxTokens = body.max_tokens ?? 8192;
    const stream = body.stream !== false;

    const litellmBody = {
      model,
      messages: body.messages,
      temperature,
      max_tokens: maxTokens,
      stream,
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const response = await fetch(`${LITELLM_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LITELLM_API_KEY}`,
        },
        body: JSON.stringify(litellmBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(
          { status: response.status, body: errorBody, model },
          "LiteLLM request failed",
        );
        res.status(response.status).json({
          error: `LiteLLM returned ${response.status}`,
          details: errorBody,
        });
        return;
      }

      if (!stream) {
        const data = await response.json();
        res.json(data);
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const reader = response.body?.getReader();
      if (!reader) {
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            res.write(trimmed + "\n\n");
            if (trimmed === "data: [DONE]") {
              res.end();
              return;
            }
          }
        }

        if (buffer.trim()) {
          res.write(buffer.trim() + "\n\n");
        }
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (streamErr) {
        logger.error({ err: streamErr }, "SSE stream error");
        res.end();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        res.status(504).json({ error: "LiteLLM request timed out" });
        return;
      }
      logger.error({ err }, "Chat completion error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
