# Code Graph Service

Semantic code analysis for Staple agents using graph-based code understanding.

## What is Code Graph?

Code Graph analyzes codebases semantically using:
- Abstract Syntax Trees (AST)
- Call graphs
- Dependency graphs
- Symbol resolution

This enables agents to understand code structure beyond text search.

## Configuration

```bash
CODE_GRAPH_URL=http://localhost:8097    # Required
CODE_GRAPH_TIMEOUT=30000                # Optional: request timeout in ms
```

## Usage

### Index a Repository

Before analysis, index the repository:

```typescript
import { indexRepository } from "./code-graph-client.js";

const result = await indexRepository({
  repoUrl: "https://github.com/user/repo",
  branch: "main",
  paths: ["src/", "lib/"], // Optional: limit to specific paths
});

console.log(`Indexing job: ${result.jobId}`);
```

### Find Function Definitions

```typescript
import { findFunctions } from "./code-graph-client.js";

const functions = await findFunctions("handleRequest", repoUrl);
// [
//   {
//     name: "handleRequest",
//     file: "src/server.ts",
//     line: 42,
//     signature: "async function handleRequest(req: Request): Promise<Response>",
//     language: "typescript",
//   }
// ]
```

### Find All Callers of a Function

```typescript
import { findCallers } from "./code-graph-client.js";

const callers = await findCallers("validateUser", repoUrl);
// [
//   {
//     function: "login",
//     file: "src/auth.ts",
//     callers: ["handleLogin", "refreshToken"],
//     callees: ["validateUser", "generateToken"],
//   }
// ]
```

### Find All Functions Called by a Function

```typescript
import { findCallees } from "./code-graph-client.js";

const callees = await findCallees("processOrder", repoUrl);
// Functions that processOrder calls
```

### Get Dependency Graph

```typescript
import { getDependencies } from "./code-graph-client.js";

const deps = await getDependencies("src/api/", repoUrl);
// [
//   {
//     source: "src/api/users.ts",
//     target: "src/database/models.ts",
//     type: "import",
//     location: { file: "src/api/users.ts", line: 3 },
//   }
// ]
```

### Find Files Affected by Changes

```typescript
import { findImpactedFiles } from "./code-graph-client.js";

const impacted = await findImpactedFiles("User.save", repoUrl);
// [
//   "src/api/users.ts",
//   "src/controllers/profile.ts",
//   "tests/integration/users.test.ts",
// ]
```

## Agent Integration

Enable Knowledge Curator agent to use code graph:

```typescript
// During codebase analysis
const repoUrl = "https://github.com/user/stax";

// Index repository
await indexRepository({ repoUrl, branch: "main" });

// Find key functions
const serviceStack = await findFunctions("ServiceStack", repoUrl);
const deployers = await findFunctions("deploy", repoUrl);

// Analyze dependencies
const stackDeps = await getDependencies("stacks/08-ai/", repoUrl);

// Build architecture understanding
const callGraph = await findCallees("deploy_services", repoUrl);

// Store in memory with enhanced context
await storeMemory(db, {
  companyId,
  content: `ServiceStack pattern: ${JSON.stringify(serviceStack)}`,
  metadata: {
    type: "architecture",
    source: "code_graph",
    functions: serviceStack.map(f => f.name),
  },
});
```

## Use Cases

### 1. Architecture Discovery

"How does authentication work?"
- Find functions with "auth" in name
- Build call graph from auth entry points
- Trace dependencies

### 2. Impact Analysis

"What files would be affected by changing the User model?"
- Find all references to User model
- Trace callers and dependencies
- List affected files

### 3. Code Navigation

"Show me all functions that call validateToken"
- Build call graph
- List callers recursively
- Show file locations

### 4. Dependency Analysis

"What does the API module depend on?"
- Get dependency graph for API module
- Identify circular dependencies
- Show layering violations

### 5. Technical Debt Detection

"Find unused functions"
- List all functions
- Find functions with zero callers
- Exclude entry points

## Architecture

```
Knowledge Curator Agent
      │
      ├─> Code Graph Service
      │        │
      │        ├─> Repository Indexer
      │        │    └─ Parse AST (tree-sitter)
      │        │
      │        ├─> Symbol Resolver
      │        │    └─ Build symbol table
      │        │
      │        ├─> Call Graph Builder
      │        │    └─ Trace function calls
      │        │
      │        └─> Dependency Analyzer
      │             └─ Track imports/exports
      │
      └─> Store findings in Memory (Qdrant)
```

## Supported Languages

- JavaScript/TypeScript
- Python
- Go
- Rust
- Java
- C/C++

Language support depends on Code Graph service deployment.

## Performance

- **Initial Indexing**: 1-5 minutes for medium repos (1000+ files)
- **Query Latency**: 50-500ms depending on complexity
- **Cache**: Results cached per repo/commit
- **Incremental Updates**: Only re-index changed files

## Deployment

### Local Development

```bash
# Start Code Graph service
docker run -p 8097:8097 code-graph:latest

# Set environment
export CODE_GRAPH_URL=http://localhost:8097
```

### Kubernetes

```yaml
env:
  - name: CODE_GRAPH_URL
    value: "http://code-graph.llm.svc.cluster.local:8097"
  - name: CODE_GRAPH_TIMEOUT
    value: "60000"
```

## Limitations

- Large repositories (10k+ files) may take 10+ minutes to index
- Incremental indexing not always available
- Some language features (macros, metaprogramming) may not be fully analyzed
- Cross-repository analysis not yet supported

## Comparison to Text Search

| Feature | Text Search (Grep) | Code Graph |
|---------|-------------------|------------|
| Find string | ✅ Fast | ✅ Accurate |
| Find function definition | ⚠️ May have false positives | ✅ Exact |
| Find callers | ❌ Not possible | ✅ Complete |
| Dependency graph | ❌ Manual | ✅ Automatic |
| Impact analysis | ❌ Guesswork | ✅ Precise |
| Cross-file tracing | ❌ Very hard | ✅ Easy |

**Best practice**: Use text search for initial discovery, Code Graph for deep analysis.

## Integration with Memory Service

Code Graph + Memory = Powerful combination:

```typescript
// Index repository
await indexRepository({ repoUrl });

// Analyze architecture
const servicePatterns = await findFunctions("ServiceStack", repoUrl);

// Store in memory for future recall
await storeMemory(db, {
  companyId,
  content: `STAX uses ServiceStack pattern for all deployments.
            Entry point: ${servicePatterns[0].file}:${servicePatterns[0].line}`,
  metadata: {
    type: "architecture_pattern",
    source: "code_graph",
    repoUrl,
  },
});

// Later, agent can recall this architectural knowledge
const memories = await searchMemories(db, {
  companyId,
  query: "How are STAX services deployed?",
});
```
