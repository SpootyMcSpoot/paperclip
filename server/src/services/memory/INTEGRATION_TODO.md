# Memory Service Integration TODO

## Completed ✅
- [x] Qdrant client with configurable endpoints
- [x] Database schema for memories table
- [x] Memory service (store, search, get, delete, stats)
- [x] API routes for memory operations
- [x] Database migration
- [x] Embedding service (LiteLLM, OpenAI, local fallback)
- [x] Server integration (routes registered in app.ts)

## Remaining Work

### 1. Agent Integration
**Priority: MEDIUM** (moved from HIGH - core integration complete)

Enable agents to use memory during execution:

```typescript
// In agent execution context
import { searchMemories, storeMemory } from "../services/memory/index.js";

// Retrieve relevant memories
const memories = await searchMemories(db, {
  companyId: agent.companyId,
  agentId: agent.id,
  query: currentTaskDescription,
  limit: 5,
});

// Include memories in agent prompt
const contextPrompt = `
Relevant memories from past work:
${memories.map(m => `- ${m.content}`).join("\n")}
`;

// After agent completes work, store new memory
await storeMemory(db, {
  companyId: agent.companyId,
  agentId: agent.id,
  content: "Learned that X pattern is used for Y",
  metadata: {
    type: "lesson",
    source: "task_completion",
    tags: ["architecture", "patterns"],
  },
  issueId: currentIssue.id,
  heartbeatRunId: currentRun.id,
});
```

### 4. UI Components
**Priority: MEDIUM**

Add memory management UI:
- Memory browser (list memories for company/agent)
- Memory search interface
- Memory statistics dashboard
- Manual memory creation/editing

### 5. Automatic Memory Extraction
**Priority: MEDIUM**

Automatically extract memories from:
- Issue comments (knowledge shared in discussions)
- Document revisions (key facts from docs)
- Agent activity logs (lessons learned)
- Heartbeat run summaries (what was accomplished)

### 6. Memory Retention Policies
**Priority: LOW**

Implement automatic cleanup:
- Delete memories older than X days
- Archive low-importance memories
- Deduplicate similar memories
- Merge related memories

### 7. Memory Quality Scoring
**Priority: LOW**

Track memory usefulness:
- How often memory is retrieved
- User feedback on memory relevance
- Agent feedback on memory helpfulness
- Automatic quality scoring

### 8. Cross-Agent Memory Sharing
**Priority: LOW**

Enable agents to share learnings:
- Company-wide shared memories
- Team-specific memories
- Agent-private memories
- Permission-based access control

## Testing

### Unit Tests
- [x] Basic configuration tests
- [ ] Memory service functions (with mocked Qdrant)
- [ ] Embedding generation
- [ ] Collection management

### Integration Tests
- [ ] Full flow: store -> search -> retrieve
- [ ] Multi-agent memory isolation
- [ ] Memory deletion cleanup
- [ ] Statistics accuracy

### E2E Tests
- [ ] API endpoints work correctly
- [ ] Authentication/authorization
- [ ] Error handling
- [ ] Performance under load

## Documentation

- [x] README for memory service
- [ ] API documentation
- [ ] Agent integration guide
- [ ] Deployment guide
- [ ] Troubleshooting guide

## Performance Optimization

- [ ] Embedding caching (avoid re-embedding identical text)
- [ ] Batch operations for bulk memory storage
- [ ] Pagination for large result sets
- [ ] Index optimization for common queries

## Security

- [ ] Validate company access for all operations
- [ ] Sanitize memory content
- [ ] Rate limiting on search operations
- [ ] Audit logging for memory operations
