export const type = "libai_local";
export const label = "LibAI CLI (local)";

export const models = [
  { id: "qwen3-coder", label: "Qwen 3 Coder (STAX)" },
  { id: "qwen35-coder", label: "Qwen 3.5 Coder (STAX)" },
  { id: "deepseek-r1", label: "DeepSeek R1 (STAX)" },
  { id: "qwen3", label: "Qwen 3 (STAX)" },
];

export const agentConfigurationDoc = `# libai_local agent configuration

Adapter: libai_local

Use when:
- You want Staple to execute tasks using LibAI CLI with STAX local models.
- You need MCP tool integration (filesystem, git, github, kubernetes, prometheus).
- You want model fallback chains across local providers.
- You prefer local-first execution with zero cloud API cost.

Don't use when:
- You need Claude-specific features (use claude_local).
- You need cloud model quality for complex reasoning (use litellm_gateway with cloud models).

Core fields:
- cwd (string, optional): Working directory for libai-cli execution
- model (string, optional): Model to use (default: from libai config)
- profile (string, optional): STAX provider profile ("stax-litellm", "stax-ollama", "stax-ollama-cluster")
- promptTemplate (string, optional): Run prompt template with {{context}} variables
- maxTurns (number, optional): Max tool-use loop turns (default: 25)
- command (string, optional): CLI command (default: "libai")
- extraArgs (string[], optional): Additional CLI arguments
- env (object, optional): Environment variables to inject
- mcpServers (string[], optional): MCP servers to enable (e.g., ["stax-memory", "stax-github"])
- outputFormat (string, optional): Output format: "text" (default), "json", "markdown"
- codeMode (boolean, optional): Enable --code flag for code-only output

Operational fields:
- timeoutSec (number, optional): Execution timeout in seconds (default: 300)
- graceSec (number, optional): SIGTERM grace period in seconds (default: 10)

Environment variables:
- LIBAI_LLM__BASE_URL: LLM API base URL
- LIBAI_LLM__API_KEY: LLM API key
- LIBAI_LLM__MODEL: Default model

Staple agent adapterConfig example:
\`\`\`json
{
  "cwd": "/home/user/repos/my-project",
  "model": "qwen35-coder",
  "profile": "stax-litellm",
  "maxTurns": 25,
  "mcpServers": ["stax-memory", "stax-github"],
  "outputFormat": "text"
}
\`\`\`
`;
