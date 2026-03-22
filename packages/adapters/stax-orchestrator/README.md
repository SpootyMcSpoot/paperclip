# @paperclipai/adapter-stax-orchestrator

STAX AI Orchestrator adapter for Paperclip workflow execution.

## Overview

Integrates Paperclip with the STAX AI Orchestrator for executing complex multi-step AI workflows, MCP tool calls, and code intelligence queries.

## Installation

```bash
pnpm add @paperclipai/adapter-stax-orchestrator
```

## Usage

### Basic Workflow Execution

```typescript
import { OrchestratorClient } from "@paperclipai/adapter-stax-orchestrator";

const client = new OrchestratorClient();

// Check orchestrator health
const health = await client.health();
console.log(health); // { status: "ok", version: "2.0.0" }

// Execute workflow
const workflow = {
  name: "code_search",
  description: "Find code in repository",
  tasks: [
    {
      id: "search",
      type: "mcp_tool_call",
      name: "Search Code",
      config: {
        server: "codegraphcontext",
        tool: "find_code",
        arguments: { query: "class ServiceModule" },
      },
    },
  ],
};

const workflowId = await client.submitWorkflow(workflow);
const execution = await client.getWorkflow(workflowId);
```

### Execute and Wait for Completion

```typescript
const execution = await client.executeWorkflow(workflow, {
  pollInterval: 1000, // Check every second
  maxWait: 60000, // Wait up to 60 seconds
});

console.log(execution.status); // "completed" or "failed"
console.log(execution.task_results);
```

### Code Intelligence Helper

```typescript
import {
  OrchestratorClient,
  createCodeIntelligenceWorkflow,
} from "@paperclipai/adapter-stax-orchestrator";

const client = new OrchestratorClient();
const workflow = createCodeIntelligenceWorkflow("find EnvLoader class");

const execution = await client.executeWorkflow(workflow);
const results = execution.task_results["find_code"]?.output;
```

### LLM Completion Helper

```typescript
import {
  OrchestratorClient,
  createLLMCompletionWorkflow,
} from "@paperclipai/adapter-stax-orchestrator";

const client = new OrchestratorClient();
const workflow = createLLMCompletionWorkflow(
  "Explain how the EnvLoader class works",
  "qwen35-coder"
);

const execution = await client.executeWorkflow(workflow);
const completion = execution.task_results["completion"]?.output;
```

## Configuration

The orchestrator URL is configured via environment variable:

```bash
export STAX_ORCHESTRATOR_URL="http://ai-orchestrator.llm.svc.cluster.local:8080"
```

Or pass directly to constructor:

```typescript
const client = new OrchestratorClient(
  "http://ai-orchestrator.llm.svc.cluster.local:8080"
);
```

## Task Types

- `mcp_tool_call`: Execute MCP tool via gateway
- `llm_completion`: Generate LLM completion
- `rag_query`: Query RAG system
- `vector_search`: Search vector database
- `data_transform`: Transform data with expressions

## Integration with Paperclip Agents

```typescript
// In agent skill/tool execution
import { OrchestratorClient } from "@paperclipai/adapter-stax-orchestrator";

async function executeCodeSearch(query: string) {
  const client = new OrchestratorClient();
  const workflow = {
    name: "agent_code_search",
    tasks: [
      {
        id: "search",
        type: "mcp_tool_call",
        name: "Find Code",
        config: {
          server: "codegraphcontext",
          tool: "find_code",
          arguments: { query },
        },
      },
    ],
  };

  const execution = await client.executeWorkflow(workflow);
  return execution.task_results["search"]?.output;
}
```

## Related

- STAX AI Orchestrator: Workflow execution engine
- MCP Gateway: Protocol routing for MCP servers
- CodeGraphContext: Code intelligence MCP server
