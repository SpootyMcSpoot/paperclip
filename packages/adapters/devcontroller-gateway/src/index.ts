export const type = "devcontroller_gateway";
export const label = "AI Dev Controller";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# devcontroller_gateway agent configuration

Adapter: devcontroller_gateway

Use when:
- You want Staple to delegate autonomous software development tasks to the AI Dev Controller.
- Tasks require multi-step reconciliation loops with quality gates (lint, test, security).
- You need escalation bridging: AI Dev Controller retries -> Staple board approval.
- You want cost-tracked autonomous coding with budget enforcement.

Don't use when:
- You need direct interactive chat (use claude_local or litellm_gateway instead).
- The task is a simple one-shot LLM completion (use litellm_gateway).

Core fields:
- baseUrl (string, required): AI Dev Controller API URL (e.g., http://ai-dev-controller.llm.svc.cluster.local:8096)
- apiKey (string, optional): Bearer token for authentication

Task execution fields:
- workspace (string, optional): Git repo URL or local path for task execution
- branch (string, optional): Git branch to work on (default: auto-created feature branch)
- maxIterations (number, optional): Max reconciliation loop iterations (default: 10)
- maxCostUsd (number, optional): Budget cap in USD (default: 5.0)
- qualityGates (string[], optional): Gates to run (default: ["syntax", "lint", "tests"])
- strategistModel (string, optional): Model for goal decomposition (default: from controller config)
- executorModel (string, optional): Model for code execution (default: from controller config)
- autoCreatePR (boolean, optional): Auto-create GitHub PR on success (default: true)
- escalationMode (string, optional): "internal" (retry within controller) or "staple" (escalate to Staple board)

Environment variables:
- DEVCONTROLLER_API_KEY: Bearer token (overridden by config.apiKey if set)
- DEVCONTROLLER_BASE_URL: Base URL fallback (overridden by config.baseUrl if set)

Staple agent adapterConfig example:
\`\`\`json
{
  "baseUrl": "http://ai-dev-controller.llm.svc.cluster.local:8096",
  "workspace": "https://github.com/org/repo",
  "maxIterations": 10,
  "maxCostUsd": 5.0,
  "qualityGates": ["syntax", "lint", "tests"],
  "escalationMode": "staple"
}
\`\`\`
`;
