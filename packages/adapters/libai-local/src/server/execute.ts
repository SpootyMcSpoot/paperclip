import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterSessionCodec,
} from "@stapleai/adapter-utils";
import {
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  parseObject,
  buildStapleEnv,
  renderTemplate,
  runChildProcess,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
} from "@stapleai/adapter-utils/server-utils";

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

interface LibaiRuntimeConfig {
  command: string;
  cwd: string;
  model: string | null;
  profile: string | null;
  maxTurns: number;
  outputFormat: string;
  codeMode: boolean;
  extraArgs: string[];
  mcpServers: string[];
  env: Record<string, string>;
  timeoutSec: number;
  graceSec: number;
}

function parseConfig(
  config: Record<string, unknown>,
  context: Record<string, unknown>
): LibaiRuntimeConfig {
  const command = asString(config.command, "libai");
  const cwd = asString(
    config.cwd ?? context.STAPLE_WORKSPACE_CWD,
    process.cwd()
  );
  const model = nonEmpty(config.model);
  const profile = nonEmpty(config.profile);
  const maxTurns = Math.max(1, Math.floor(asNumber(config.maxTurns, 25)));
  const outputFormat = asString(config.outputFormat, "text");
  const codeMode = asBoolean(config.codeMode, false);
  const extraArgs = asStringArray(config.extraArgs);
  const mcpServers = asStringArray(config.mcpServers);
  const timeoutSec = Math.max(0, Math.floor(asNumber(config.timeoutSec, 300)));
  const graceSec = Math.max(0, Math.floor(asNumber(config.graceSec, 10)));

  const envConfig = parseObject(config.env) as Record<string, string>;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v === "string") env[k] = v;
  }

  return {
    command,
    cwd,
    model,
    profile,
    maxTurns,
    outputFormat,
    codeMode,
    extraArgs,
    mcpServers,
    env,
    timeoutSec,
    graceSec,
  };
}

function buildArgs(rc: LibaiRuntimeConfig, prompt: string): string[] {
  const args: string[] = [];

  if (rc.model) {
    args.push("--model", rc.model);
  }

  if (rc.profile) {
    args.push("--profile", rc.profile);
  }

  if (rc.maxTurns > 0) {
    args.push("--max-turns", String(rc.maxTurns));
  }

  if (rc.outputFormat !== "text") {
    args.push("--format", rc.outputFormat);
  }

  if (rc.codeMode) {
    args.push("--code");
  }

  args.push("--no-interactive");

  args.push(...rc.extraArgs);

  args.push("--", prompt);

  return args;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown): Record<string, unknown> | null {
    if (typeof raw !== "object" || raw === null) return null;
    const record = raw as Record<string, unknown>;
    return {
      sessionId: record.sessionId ?? null,
      cwd: record.cwd ?? null,
    };
  },
  serialize(
    params: Record<string, unknown> | null
  ): Record<string, unknown> | null {
    if (!params) return null;
    return {
      sessionId: params.sessionId ?? null,
      cwd: params.cwd ?? null,
    };
  },
  getDisplayId(params: Record<string, unknown> | null): string | null {
    if (!params) return null;
    return (params.sessionId as string) ?? null;
  },
};

export async function execute(
  ctx: AdapterExecutionContext
): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta } = ctx;
  const configObj = parseObject(config);
  const rc = parseConfig(configObj, context);

  const processEnv: NodeJS.ProcessEnv = { ...process.env, ...rc.env };

  try {
    await ensureCommandResolvable(rc.command, rc.cwd, processEnv);
  } catch (err) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `LibAI CLI not found: "${rc.command}". Install with: pip install libai-cli. ${err instanceof Error ? err.message : ""}`,
      errorCode: "libai_command_not_found",
    };
  }

  try {
    await ensureAbsoluteDirectory(rc.cwd);
  } catch (err) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Working directory not accessible: ${rc.cwd}. ${err instanceof Error ? err.message : ""}`,
      errorCode: "libai_cwd_invalid",
    };
  }

  const promptTemplate = asString(
    configObj.promptTemplate,
    "You are agent {{agent.name}} working on a Staple task. {{context.taskDescription}}"
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

  const args = buildArgs(rc, prompt);

  const stapleEnv = buildStapleEnv({ id: agent.id, companyId: agent.companyId });
  const env: Record<string, string> = {
    ...stapleEnv,
    ...rc.env,
  };

  if (rc.model) {
    env["LIBAI_LLM__MODEL"] = rc.model;
  }

  const mergedEnv = ensurePathInEnv({ ...process.env, ...env });
  const stringEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(mergedEnv)) {
    if (typeof v === "string") stringEnv[k] = v;
  }

  if (onMeta) {
    await onMeta({
      adapterType: "libai_local",
      command: rc.command,
      cwd: rc.cwd,
      commandArgs: args,
      prompt,
      context,
    });
  }

  await onLog(
    "stdout",
    `[libai] executing: ${rc.command} ${rc.model ? `model=${rc.model}` : ""} cwd=${rc.cwd}\n`
  );

  const result = await runChildProcess(runId, rc.command, args, {
    cwd: rc.cwd,
    env: stringEnv,
    timeoutSec: rc.timeoutSec,
    graceSec: rc.graceSec,
    onLog,
  });

  const summary = result.stdout.trim();

  if (result.timedOut) {
    return {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: true,
      errorMessage: `LibAI CLI timed out after ${rc.timeoutSec}s`,
      errorCode: "libai_timeout",
      summary: summary || undefined,
      provider: "libai",
      model: rc.model,
    };
  }

  if (result.exitCode !== 0) {
    const stderrTail = result.stderr.trim().split("\n").slice(-5).join("\n");
    return {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: false,
      errorMessage: `LibAI CLI exited with code ${result.exitCode}${stderrTail ? `: ${stderrTail}` : ""}`,
      errorCode: "libai_exit_error",
      summary: summary || undefined,
      provider: "libai",
      model: rc.model,
    };
  }

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    provider: "libai",
    model: rc.model,
    billingType: "api",
    summary: summary || undefined,
  };
}
