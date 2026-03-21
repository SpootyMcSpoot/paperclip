# Code Graph Integration TODO

## Completed ✅
- [x] Code Graph client with configurable endpoint
- [x] Repository indexing
- [x] Function search
- [x] Call graph queries (callers, callees)
- [x] Dependency analysis
- [x] Impact analysis
- [x] Health check

## Remaining Work

### 1. Agent Integration
**Priority: HIGH**

Integrate with Knowledge Curator agent:

```typescript
// In Knowledge Curator execution
import {
  indexRepository,
  findFunctions,
  findCallers,
  getDependencies,
} from "../services/code-graph/index.js";

// Index repositories during initial learning
for (const repo of companyRepos) {
  const result = await indexRepository({
    repoUrl: repo.url,
    branch: repo.defaultBranch,
  });

  console.log(`Indexing ${repo.name}: ${result.jobId}`);
}

// Discover architecture patterns
const serviceStacks = await findFunctions("ServiceStack", repoUrl);
const deployFunctions = await findFunctions("deploy", repoUrl);

// Analyze dependencies
const aiStackDeps = await getDependencies("stacks/08-ai/", repoUrl);

// Build call graphs
const deploymentFlow = await findCallees("deploy_services", repoUrl);

// Store findings in memory
await storeMemory(db, {
  companyId,
  content: `STAX ServiceStack pattern: ${JSON.stringify(serviceStacks)}`,
  metadata: {
    type: "architecture",
    source: "code_graph",
  },
});
```

### 2. Workspace Integration
**Priority: MEDIUM**

Integrate with execution workspaces:

```typescript
// When agent clones repo into workspace
const workspace = await createWorkspace({
  repoUrl,
  branch,
});

// Automatically index workspace
await indexRepository({
  repoUrl: workspace.localPath,
  branch,
});

// Agent can now query code structure
const affected = await findImpactedFiles(
  "User.save",
  workspace.localPath
);
```

### 3. Caching
**Priority: MEDIUM**

Cache code graph results:

```typescript
// In database schema
export const codeGraphCache = pgTable("code_graph_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoUrl: text("repo_url").notNull(),
  commit: text("commit").notNull(),
  queryType: text("query_type").notNull(),
  queryParams: jsonb("query_params").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Check cache before querying
const cached = await db
  .select()
  .from(codeGraphCache)
  .where(and(
    eq(codeGraphCache.repoUrl, repoUrl),
    eq(codeGraphCache.commit, commit),
    eq(codeGraphCache.queryType, "findFunctions"),
    gte(codeGraphCache.expiresAt, new Date()),
  ))
  .limit(1);

if (cached[0]) {
  return cached[0].result;
}
```

### 4. Incremental Indexing
**Priority: LOW**

Only re-index changed files:

```typescript
interface IncrementalIndexRequest {
  repoUrl: string;
  baseCommit: string;
  newCommit: string;
  changedFiles?: string[];
}

export async function incrementalIndex(
  request: IncrementalIndexRequest,
): Promise<{ jobId: string }> {
  // Code Graph service handles incremental update
  const response = await fetch(`${config.baseUrl}/api/index/incremental`, {
    method: "POST",
    body: JSON.stringify(request),
  });

  return await response.json();
}
```

### 5. Query Builder
**Priority: LOW**

Simplify complex queries:

```typescript
export class CodeGraphQuery {
  constructor(private repoUrl: string) {}

  async findFunctionsByPattern(pattern: RegExp): Promise<FunctionDefinition[]> {
    // Find all functions matching pattern
  }

  async traceCallChain(entryPoint: string, maxDepth: number = 5): Promise<CallGraphNode[]> {
    // Recursively build call chain
  }

  async findCircularDependencies(): Promise<Dependency[][]> {
    // Detect circular import cycles
  }

  async findUnusedFunctions(): Promise<FunctionDefinition[]> {
    // Functions with zero callers
  }

  async findDeadCode(): Promise<string[]> {
    // Files/functions never imported/called
  }
}
```

### 6. Visualization
**Priority: LOW**

Generate visual representations:

```typescript
export async function generateCallGraphSVG(
  functionName: string,
  repoUrl: string,
): Promise<string> {
  // Generate SVG diagram of call graph
  const graph = await buildCallGraph(functionName, repoUrl);
  return renderSVG(graph);
}

export async function generateDependencyDiagram(
  path: string,
  repoUrl: string,
): Promise<string> {
  // Generate dependency diagram
  const deps = await getDependencies(path, repoUrl);
  return renderDependencyGraph(deps);
}
```

### 7. Cross-Repository Analysis
**Priority: LOW**

Analyze dependencies across multiple repos:

```typescript
export async function findCrossRepoUsage(
  symbol: string,
  repos: string[],
): Promise<Array<{ repo: string; usages: FunctionDefinition[] }>> {
  const results = await Promise.all(
    repos.map(async (repo) => ({
      repo,
      usages: await findFunctions(symbol, repo),
    }))
  );

  return results.filter(r => r.usages.length > 0);
}
```

### 8. GitHub Integration
**Priority: LOW**

Trigger indexing on PR events:

```typescript
// GitHub webhook handler
app.post("/webhooks/github/push", async (req, res) => {
  const { repository, after } = req.body;

  // Trigger incremental indexing
  await incrementalIndex({
    repoUrl: repository.clone_url,
    baseCommit: req.body.before,
    newCommit: after,
  });

  res.json({ status: "indexing" });
});
```

## Testing

### Unit Tests
- [x] Basic configuration tests
- [ ] Function search
- [ ] Call graph queries
- [ ] Dependency analysis
- [ ] Impact analysis

### Integration Tests
- [ ] Index real repository
- [ ] Find functions in indexed repo
- [ ] Build call graph
- [ ] Analyze dependencies
- [ ] Query caching

### E2E Tests
- [ ] Knowledge Curator uses code graph
- [ ] Findings stored in memory
- [ ] Agent recalls architectural knowledge
- [ ] Incremental indexing works

## Documentation

- [x] README for Code Graph service
- [ ] Query guide with examples
- [ ] Integration guide for agents
- [ ] Performance tuning guide
- [ ] Troubleshooting guide

## Performance

- [ ] Query result caching (1 hour TTL)
- [ ] Incremental indexing (only changed files)
- [ ] Connection pooling
- [ ] Async indexing jobs
- [ ] Batch queries

## Known Limitations

1. **Initial indexing slow**: Large repos take 10+ minutes
   - Need: Progress reporting, background jobs

2. **No cross-repo analysis**: Each repo analyzed independently
   - Need: Multi-repo dependency graph

3. **Limited language support**: Depends on Code Graph deployment
   - Need: Document supported languages

4. **No real-time updates**: Index becomes stale after commits
   - Need: Webhook integration for auto-reindex
