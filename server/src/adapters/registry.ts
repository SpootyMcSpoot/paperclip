import type { ServerAdapterModule } from "./types.js";
import { getAdapterSessionManagement } from "@stapleai/adapter-utils";
import {
  execute as claudeExecute,
  testEnvironment as claudeTestEnvironment,
  sessionCodec as claudeSessionCodec,
  getQuotaWindows as claudeGetQuotaWindows,
} from "@stapleai/adapter-claude-local/server";
import {
  agentConfigurationDoc as claudeAgentConfigurationDoc,
  models as claudeModels,
} from "@stapleai/adapter-claude-local";
import {
  execute as codexExecute,
  testEnvironment as codexTestEnvironment,
  sessionCodec as codexSessionCodec,
  getQuotaWindows as codexGetQuotaWindows,
} from "@stapleai/adapter-codex-local/server";
import {
  agentConfigurationDoc as codexAgentConfigurationDoc,
  models as codexModels,
} from "@stapleai/adapter-codex-local";
import {
  execute as cursorExecute,
  testEnvironment as cursorTestEnvironment,
  sessionCodec as cursorSessionCodec,
} from "@stapleai/adapter-cursor-local/server";
import {
  agentConfigurationDoc as cursorAgentConfigurationDoc,
  models as cursorModels,
} from "@stapleai/adapter-cursor-local";
import {
  execute as geminiExecute,
  testEnvironment as geminiTestEnvironment,
  sessionCodec as geminiSessionCodec,
} from "@stapleai/adapter-gemini-local/server";
import {
  agentConfigurationDoc as geminiAgentConfigurationDoc,
  models as geminiModels,
} from "@stapleai/adapter-gemini-local";
import {
  execute as openCodeExecute,
  testEnvironment as openCodeTestEnvironment,
  sessionCodec as openCodeSessionCodec,
  listOpenCodeModels,
} from "@stapleai/adapter-opencode-local/server";
import { agentConfigurationDoc as openCodeAgentConfigurationDoc } from "@stapleai/adapter-opencode-local";
import {
  execute as openclawGatewayExecute,
  testEnvironment as openclawGatewayTestEnvironment,
} from "@stapleai/adapter-openclaw-gateway/server";
import {
  agentConfigurationDoc as openclawGatewayAgentConfigurationDoc,
  models as openclawGatewayModels,
} from "@stapleai/adapter-openclaw-gateway";
import { listCodexModels } from "./codex-models.js";
import { listCursorModels } from "./cursor-models.js";
import {
  execute as piExecute,
  testEnvironment as piTestEnvironment,
  sessionCodec as piSessionCodec,
  listPiModels,
} from "@stapleai/adapter-pi-local/server";
import { agentConfigurationDoc as piAgentConfigurationDoc } from "@stapleai/adapter-pi-local";
import {
  execute as hermesExecute,
  testEnvironment as hermesTestEnvironment,
  sessionCodec as hermesSessionCodec,
} from "hermes-paperclip-adapter/server";
import {
  agentConfigurationDoc as hermesAgentConfigurationDoc,
  models as hermesModels,
} from "hermes-paperclip-adapter";
import {
  execute as litellmGatewayExecute,
  testEnvironment as litellmGatewayTestEnvironment,
} from "@stapleai/adapter-litellm-gateway/server";
import {
  agentConfigurationDoc as litellmGatewayAgentConfigurationDoc,
  models as litellmGatewayModels,
} from "@stapleai/adapter-litellm-gateway";
import {
  execute as devcontrollerExecute,
  testEnvironment as devcontrollerTestEnvironment,
} from "@stapleai/adapter-devcontroller-gateway/server";
import {
  agentConfigurationDoc as devcontrollerAgentConfigurationDoc,
  models as devcontrollerModels,
} from "@stapleai/adapter-devcontroller-gateway";
import {
  execute as libaiExecute,
  testEnvironment as libaiTestEnvironment,
  sessionCodec as libaiSessionCodec,
} from "@stapleai/adapter-libai-local/server";
import {
  agentConfigurationDoc as libaiAgentConfigurationDoc,
  models as libaiModels,
} from "@stapleai/adapter-libai-local";
import { listClaudeModels } from "./claude-models.js";
import { processAdapter } from "./process/index.js";
import { httpAdapter } from "./http/index.js";

const claudeLocalAdapter: ServerAdapterModule = {
  type: "claude_local",
  execute: claudeExecute,
  testEnvironment: claudeTestEnvironment,
  sessionCodec: claudeSessionCodec,
  sessionManagement: getAdapterSessionManagement("claude_local") ?? undefined,
  models: claudeModels,
  listModels: listClaudeModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: claudeAgentConfigurationDoc,
  getQuotaWindows: claudeGetQuotaWindows,
};

const codexLocalAdapter: ServerAdapterModule = {
  type: "codex_local",
  execute: codexExecute,
  testEnvironment: codexTestEnvironment,
  sessionCodec: codexSessionCodec,
  sessionManagement: getAdapterSessionManagement("codex_local") ?? undefined,
  models: codexModels,
  listModels: listCodexModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: codexAgentConfigurationDoc,
  getQuotaWindows: codexGetQuotaWindows,
};

const cursorLocalAdapter: ServerAdapterModule = {
  type: "cursor",
  execute: cursorExecute,
  testEnvironment: cursorTestEnvironment,
  sessionCodec: cursorSessionCodec,
  sessionManagement: getAdapterSessionManagement("cursor") ?? undefined,
  models: cursorModels,
  listModels: listCursorModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: cursorAgentConfigurationDoc,
};

const geminiLocalAdapter: ServerAdapterModule = {
  type: "gemini_local",
  execute: geminiExecute,
  testEnvironment: geminiTestEnvironment,
  sessionCodec: geminiSessionCodec,
  sessionManagement: getAdapterSessionManagement("gemini_local") ?? undefined,
  models: geminiModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: geminiAgentConfigurationDoc,
};

const openclawGatewayAdapter: ServerAdapterModule = {
  type: "openclaw_gateway",
  execute: openclawGatewayExecute,
  testEnvironment: openclawGatewayTestEnvironment,
  models: openclawGatewayModels,
  supportsLocalAgentJwt: false,
  agentConfigurationDoc: openclawGatewayAgentConfigurationDoc,
};

const openCodeLocalAdapter: ServerAdapterModule = {
  type: "opencode_local",
  execute: openCodeExecute,
  testEnvironment: openCodeTestEnvironment,
  sessionCodec: openCodeSessionCodec,
  sessionManagement: getAdapterSessionManagement("opencode_local") ?? undefined,
  models: [],
  listModels: listOpenCodeModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: openCodeAgentConfigurationDoc,
};

const piLocalAdapter: ServerAdapterModule = {
  type: "pi_local",
  execute: piExecute,
  testEnvironment: piTestEnvironment,
  sessionCodec: piSessionCodec,
  sessionManagement: getAdapterSessionManagement("pi_local") ?? undefined,
  models: [],
  listModels: listPiModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: piAgentConfigurationDoc,
};

const hermesLocalAdapter: ServerAdapterModule = {
  type: "hermes_local",
  execute: hermesExecute,
  testEnvironment: hermesTestEnvironment,
  sessionCodec: hermesSessionCodec,
  models: hermesModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: hermesAgentConfigurationDoc,
};

const litellmGatewayAdapter: ServerAdapterModule = {
  type: "litellm_gateway",
  execute: litellmGatewayExecute,
  testEnvironment: litellmGatewayTestEnvironment,
  models: litellmGatewayModels,
  supportsLocalAgentJwt: false,
  agentConfigurationDoc: litellmGatewayAgentConfigurationDoc,
};

const devcontrollerGatewayAdapter: ServerAdapterModule = {
  type: "devcontroller_gateway",
  execute: devcontrollerExecute,
  testEnvironment: devcontrollerTestEnvironment,
  models: devcontrollerModels,
  supportsLocalAgentJwt: false,
  agentConfigurationDoc: devcontrollerAgentConfigurationDoc,
};

const libaiLocalAdapter: ServerAdapterModule = {
  type: "libai_local",
  execute: libaiExecute,
  testEnvironment: libaiTestEnvironment,
  sessionCodec: libaiSessionCodec,
  sessionManagement: getAdapterSessionManagement("libai_local") ?? undefined,
  models: libaiModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: libaiAgentConfigurationDoc,
};

const adaptersByType = new Map<string, ServerAdapterModule>(
  [
    claudeLocalAdapter,
    codexLocalAdapter,
    openCodeLocalAdapter,
    piLocalAdapter,
    cursorLocalAdapter,
    geminiLocalAdapter,
    openclawGatewayAdapter,
    hermesLocalAdapter,
    litellmGatewayAdapter,
    devcontrollerGatewayAdapter,
    libaiLocalAdapter,
    processAdapter,
    httpAdapter,
  ].map((a) => [a.type, a]),
);

export function getServerAdapter(type: string): ServerAdapterModule {
  const adapter = adaptersByType.get(type);
  if (!adapter) {
    // Fall back to process adapter for unknown types
    return processAdapter;
  }
  return adapter;
}

export async function listAdapterModels(
  type: string,
): Promise<{ id: string; label: string }[]> {
  const adapter = adaptersByType.get(type);
  if (!adapter) return [];
  if (adapter.listModels) {
    const discovered = await adapter.listModels();
    if (discovered.length > 0) return discovered;
  }
  return adapter.models ?? [];
}

export function listServerAdapters(): ServerAdapterModule[] {
  return Array.from(adaptersByType.values());
}

export function findServerAdapter(type: string): ServerAdapterModule | null {
  return adaptersByType.get(type) ?? null;
}
