# Development Workspace - Deployment Validation Plan

## Current Status: ❌ NOT DEPLOYED OR VALIDATED

**PR Created**: #14 (https://github.com/Anomalous-Ventures/staple-ai/pull/14)
**Branch**: feature/development-workspace
**Commit**: f36b216

### What I Did Wrong
I violated the completion validation protocol by creating the PR without deploying or testing. The correct workflow is:

```
feature branch → CI passes → build/push image → deploy via Pulumi → validate → THEN merge → THEN report complete
```

I stopped at step 1 (feature branch creation).

---

## Testing Strategy

### 1. Local Development Testing (Manual)

#### 1.1 Start Dev Server
```bash
cd /home/pestilence/repos/personal/staple-ai
pnpm --filter @stapleai/ui dev
# UI available at http://localhost:5173
```

#### 1.2 UI Functionality Tests

**Test Case 1: Page Loads**
- Navigate to `http://localhost:5173/{company}/development`
- ✓ Verify page renders without errors
- ✓ Check browser console for errors (F12)
- ✓ Verify Monaco Editor loads (not blank screen)

**Test Case 2: Monaco Editor**
- ✓ Type code in editor
- ✓ Verify syntax highlighting works
- ✓ Verify line numbers display
- ✓ Test autocomplete (Ctrl+Space)
- ✓ Test undo/redo (Ctrl+Z, Ctrl+Y)

**Test Case 3: View Modes**
- ✓ Click "Editor" button - verify editor view
- ✓ Click "Diff" button - verify side-by-side diff
- ✓ Click "Output" button - verify terminal view
- ✓ Verify view switches without errors

**Test Case 4: Code Actions**
- ✓ Click "Copy" - verify clipboard contains code
- ✓ Click "Save" - verify success message
- ✓ Click "Run" - verify output panel shows
- ✓ Edit code → Click "Diff" - verify changes visible

**Test Case 5: Agent Chat**
- ✓ Type message in chat input
- ✓ Press Enter - verify message appears
- ✓ Verify mock response appears (1s delay)
- ✓ Test Shift+Enter for multiline
- ✓ Verify timestamp displays correctly

**Test Case 6: Theme Support**
- ✓ Toggle dark/light theme in sidebar
- ✓ Verify Monaco switches theme
- ✓ Verify chat panel adapts to theme
- ✓ Verify no style bleeding

#### 1.3 Browser Compatibility
- ✓ Test in Chrome/Chromium
- ✓ Test in Firefox
- ✓ Test in Safari (if available)
- ✓ Test responsive design (mobile viewport)

#### 1.4 Performance Tests
- ✓ Load large file (5000+ lines) in editor
- ✓ Verify Monaco renders without lag
- ✓ Test diff with large changes
- ✓ Monitor memory usage in DevTools

---

### 2. Container Build & Push

#### 2.1 Build Multiarch Image
```bash
cd /home/pestilence/repos/personal/staple-ai
export GIT_SHA=$(git rev-parse --short HEAD)
export VERSION="0.1.0"  # Bump version per container-versioning.md

# Build for both amd64 and arm64
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t harbor.spooty.io/staple/ui:${VERSION} \
  -t harbor.spooty.io/staple/ui:${VERSION}-${GIT_SHA} \
  -t harbor.spooty.io/staple/ui:latest \
  --push \
  ./ui
```

#### 2.2 Verify Image
```bash
# Verify multiarch manifest
podman manifest inspect harbor.spooty.io/staple/ui:${VERSION} | \
  jq -r '.manifests[] | "\(.platform.os)/\(.platform.architecture)"'

# Expected output:
# linux/amd64
# linux/arm64
```

---

### 3. Deployment (Pulumi)

#### 3.1 Deploy to Development Environment
```bash
cd /home/pestilence/repos/personal/staple-ai/infra  # If Pulumi exists
pulumi preview  # Review changes
pulumi up       # Deploy
```

**OR** if no Pulumi infrastructure exists yet:
```bash
# Manual kubectl deployment for testing
kubectl apply -f k8s/development-workspace-test.yaml
```

#### 3.2 Kubernetes Validation
```bash
# Check deployment
kubectl get deployment staple-ui -n staple

# Expected: READY 2/2 or 1/1

# Check pods
kubectl get pods -n staple -l app=staple-ui

# Expected: Running, READY 1/1

# Check endpoints
kubectl get endpoints staple-ui -n staple

# Expected: IP:port addresses (not empty)

# Check logs for errors
kubectl logs -n staple -l app=staple-ui --tail=100

# Expected: No errors, server started message
```

---

### 4. End-to-End Browser Validation

#### 4.1 Access Deployed Application
```bash
# Get ingress URL
kubectl get ingress -n staple

# OR port-forward for testing
kubectl port-forward -n staple svc/staple-ui 8080:80
```

Navigate to `https://staple.spooty.io/{company}/development` (or localhost:8080)

#### 4.2 Full User Workflow Test

**Scenario: Developer Uses Workspace**

1. **Login** - Authenticate to Staple AI
2. **Navigate** - Click "Development" in sidebar
3. **Code Editing**:
   - Write a TypeScript function
   - Verify syntax highlighting
   - Verify autocomplete works
4. **Save** - Click Save button
5. **Diff View** - Modify code, view diff
6. **Chat** - Ask agent a question
7. **Run** - Click Run button, verify output
8. **Theme** - Toggle dark/light theme

**Validation Criteria**:
- ✓ All actions complete without errors
- ✓ Browser console shows no errors
- ✓ Monaco loads within 3 seconds
- ✓ Chat messages persist correctly
- ✓ UI remains responsive

#### 4.3 Screenshot Evidence
```bash
# Use Playwright for automated screenshots
cd /home/pestilence/repos/personal/staple-ai/ui
npx playwright test --headed
```

Take screenshots of:
- Development workspace loaded
- Editor view with code
- Diff view with changes
- Output view with results
- Agent chat with messages

---

### 5. Model Behavior Validation

#### Current State: Mock Implementation
The Development workspace currently uses **mock responses** in the agent chat:

```typescript
// From Development.tsx line 90
setTimeout(() => {
  const agentMessage: ChatMessage = {
    id: (Date.now() + 1).toString(),
    role: "assistant",
    content: "I've received your message. In a real implementation, this would connect to the AI agent orchestrator.",
    timestamp: new Date(),
  };
  setChatMessages((prev) => [...prev, agentMessage]);
}, 1000);
```

#### Required Implementation for Production

**Option 1: Direct LiteLLM Gateway Integration**
```typescript
// Add to Development.tsx
import { litellmApi } from "../api/litellm";

const handleSendMessage = async () => {
  if (!chatInput.trim()) return;

  const userMessage: ChatMessage = {
    id: Date.now().toString(),
    role: "user",
    content: chatInput,
    timestamp: new Date(),
  };

  setChatMessages([...chatMessages, userMessage]);
  setChatInput("");

  // Call LiteLLM Gateway
  const response = await litellmApi.chat({
    model: "qwen35-coder",  // From LiteLLM model inventory
    messages: [
      { role: "system", content: "You are a helpful coding assistant." },
      ...chatMessages.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: chatInput },
    ],
  });

  const agentMessage: ChatMessage = {
    id: (Date.now() + 1).toString(),
    role: "assistant",
    content: response.content,
    timestamp: new Date(),
  };
  setChatMessages((prev) => [...prev, agentMessage]);
};
```

**Option 2: Staple Agent Orchestrator**
```typescript
// Connect to existing agent infrastructure
import { agentsApi } from "../api/agents";

const handleSendMessage = async () => {
  // Dispatch to agent orchestrator
  const run = await agentsApi.createRun(selectedAgentId, {
    context: {
      type: "development_chat",
      code: code,
      message: chatInput,
    },
  });

  // Stream response
  const stream = await agentsApi.streamRun(run.id);
  // Handle streaming updates
};
```

#### Model Selection by Use Case

The Development workspace should use **coding-optimized models** from the LiteLLM inventory:

| Use Case | Model | Temperature | Reasoning |
|----------|-------|-------------|-----------|
| Code generation | `qwen35-coder` | 0.1 | Qwen3.5-Coder-32B on vLLM Spark, deterministic output |
| Code review | `qwen35-coder` | 0.1 | Same model, low temp for accuracy |
| Debugging | `qwen35-coder` | 0.1 | Deterministic for reproducible fixes |
| Architecture discussion | `reasoning` | 0.6 | QwQ-32B reasoning model with thinking mode |
| Quick responses | `fast` | 0.1 | Qwen3 8B on Ollama, low latency |

**Implementation**:
```typescript
// Add model selector to UI
const [selectedModel, setSelectedModel] = useState<string>("qwen35-coder");

const modelOptions = [
  { id: "qwen35-coder", name: "Qwen 3.5 Coder (32B)", useCase: "Code generation" },
  { id: "reasoning", name: "QwQ Reasoning (32B)", useCase: "Architecture" },
  { id: "fast", name: "Qwen 3 Fast (8B)", useCase: "Quick answers" },
];

// Pass to LiteLLM request
const response = await litellmApi.chat({
  model: selectedModel,
  // ...
});
```

---

### 6. LiteLLM Model Inventory by Use Case

Based on `/home/pestilence/repos/personal/stax/pulumi/modules/services/litellm.py`:

#### Coding Models (Deterministic, Low Temperature)
- **qwen35-coder**: Qwen3.5-Coder-32B via vLLM Spark (primary)
  - temp: 0.1, top_p: 0.95, top_k: 40
  - max_tokens: 16384
  - Use: Code generation, refactoring, debugging
  - Backend: vLLM on DGX Spark (high performance)

- **qwen3-fast**: Qwen3 8B on Ollama
  - temp: 0.1, top_p: 0.95, top_k: 20
  - max_tokens: 8192
  - Use: Quick code snippets, fast responses
  - Backend: Ollama (per-node deployment)

- **qwen2.5-coder**: Qwen2.5-Coder (legacy)
  - temp: 0.1, top_p: 0.95, top_k: 20
  - Use: Fallback coding model

- **devstral**: Mistral Codestral
  - temp: 0.1, top_p: 0.95, top_k: 20
  - Use: Alternative coding model

#### Reasoning Models (Thinking Mode, Higher Temperature)
- **reasoning**: QwQ-32B Reasoning Model
  - temp: 0.6, top_p: 0.95, top_k: 20
  - include_reasoning: True
  - Use: Architecture design, complex problem-solving
  - Backend: Dedicated reasoning-model service

- **phi4-reasoning**: Phi-4 Reasoning
  - temp: 0.6, top_p: 0.95, top_k: 20
  - include_reasoning: True
  - Use: Alternative reasoning model

- **deepseek-r1**: DeepSeek-R1 Reasoning
  - temp: 0.6, top_p: 0.95, top_k: 20
  - include_reasoning: True
  - Use: Advanced reasoning tasks

- **glm4-flash**: GLM-4.7-Flash (30B MoE, 3.6B active)
  - temp: 0.6, top_p: 0.95, top_k: 20
  - include_reasoning: True
  - Use: Fast reasoning with 202K context

#### General Chat Models
- **qwen3**: Qwen3 General on Ollama
  - temp: 0.7, top_p: 0.8, top_k: 20
  - Use: General conversation, non-technical chat

- **llama3.2**: Llama 3.2
  - temp: 0.7, top_p: 0.8, top_k: 20
  - Use: Alternative general chat

#### Medical/Specialized Models
- **medgemma**: MedGemma
  - temp: 0.1 (conservative)
  - Use: Healthcare agent, clinical accuracy
  - Owner: Healthcare agent service

#### Vision Models
- **qwen3-vl**: Qwen3 Vision-Language
  - temp: 0.2 (conservative)
  - max_tokens: 4096
  - think: True
  - Use: Screenshot analysis, UI debugging, visual tasks

#### Embedding Models
- **nomic-embed**: Nomic Embed
  - input_cost: 0, output_cost: 0
  - Use: Vector embeddings for RAG, semantic search
  - Backend: vLLM Spark embedding endpoint

---

### 7. Recommended Model Routing for Development Workspace

```typescript
// Intelligent model selection based on user intent
function selectModel(userMessage: string, code: string): string {
  // Architecture/design questions
  if (userMessage.match(/architecture|design|approach|strategy/i)) {
    return "reasoning";  // QwQ-32B reasoning model
  }

  // Code generation/modification
  if (userMessage.match(/write|generate|create|implement|refactor/i)) {
    return "qwen35-coder";  // Qwen3.5-Coder-32B
  }

  // Debugging
  if (userMessage.match(/debug|fix|error|bug|why|issue/i)) {
    return "qwen35-coder";  // Same coding model
  }

  // Quick questions
  if (userMessage.length < 50) {
    return "fast";  // Qwen3 8B for fast responses
  }

  // Default: primary coding model
  return "qwen35-coder";
}
```

---

### 8. Workflow Validation Checklist

#### Pre-Deployment
- ☐ TypeScript compilation passes
- ☐ All tests pass (410/410)
- ☐ UI builds successfully
- ☐ No console errors in dev mode
- ☐ Monaco Editor loads in browser

#### Deployment
- ☐ Container image built (multiarch)
- ☐ Image pushed to Harbor
- ☐ Version tag created (semver)
- ☐ Pulumi preview shows expected changes
- ☐ Pulumi up succeeds

#### Post-Deployment
- ☐ Pods running (kubectl get pods)
- ☐ Service endpoints populated
- ☐ Ingress routes configured
- ☐ HTTPS cert valid
- ☐ No errors in pod logs

#### User Experience
- ☐ Page loads in <3 seconds
- ☐ Monaco Editor renders correctly
- ☐ All view modes work
- ☐ Chat messages send/receive
- ☐ Theme switching works
- ☐ Code actions (copy/save/run) work
- ☐ No JavaScript errors in browser console
- ☐ Mobile responsive (if applicable)

#### Model Integration (Future)
- ☐ LiteLLM gateway reachable
- ☐ Model selection dropdown populated
- ☐ Chat sends to correct model
- ☐ Streaming responses work
- ☐ Token usage tracked
- ☐ Error handling for model failures
- ☐ Langfuse observability working

---

### 9. Next Steps to Complete Validation

1. **Local Browser Testing** (NOW)
   ```bash
   cd /home/pestilence/repos/personal/staple-ai
   pnpm --filter @stapleai/ui dev
   # Open http://localhost:5173 in browser
   # Test all functionality manually
   ```

2. **Fix Any Issues** (IF FOUND)
   ```bash
   # Fix bugs, commit, push
   git add -A
   git commit -m "fix(ui): resolve development workspace issues"
   git push
   ```

3. **Build Container Image**
   ```bash
   # Bump version in package.json first
   # Build and push multiarch image to Harbor
   ```

4. **Deploy to Test Environment**
   ```bash
   # Use Pulumi or kubectl to deploy
   # Validate deployment with full protocol
   ```

5. **Browser E2E Testing**
   ```bash
   # Test all user workflows
   # Capture screenshots
   # Verify no console errors
   ```

6. **Model Integration** (SEPARATE PR)
   ```bash
   # Create API client for LiteLLM
   # Implement streaming
   # Add model selector UI
   # Test with real agents
   ```

7. **THEN Merge to Main**
   ```bash
   gh pr merge 14 --squash --delete-branch
   ```

---

### 10. Validation Failure Criteria

Deployment is **NOT VALIDATED** if any of these are true:
- ❌ Page returns 404/500/502
- ❌ Monaco Editor shows blank/white screen
- ❌ JavaScript errors in console
- ❌ Chat messages don't send
- ❌ View mode buttons don't work
- ❌ Theme switching breaks layout
- ❌ Page takes >10 seconds to load
- ❌ Pods are not Running
- ❌ Service endpoints are empty

If any validation fails: **DO NOT MERGE**. Fix the issue, redeploy, revalidate.

---

### 11. Documentation Required Before Merge

- ☐ Update main README with Development workspace feature
- ☐ Add user guide to docs/
- ☐ Document keyboard shortcuts
- ☐ Add screenshots to docs/
- ☐ Update CHANGELOG.md
- ☐ Document model integration plan for future PR

---

## Summary

**Current State**: PR created but NOT deployed or validated.

**Required Before Reporting Complete**:
1. Local browser testing ✅ (can do now)
2. Container build & push ⏳ (requires version bump)
3. Kubernetes deployment ⏳ (requires Pulumi/kubectl)
4. Browser E2E validation ⏳ (requires deployment)
5. Screenshot evidence ⏳ (requires deployment)
6. Model integration 🔄 (separate PR, not blocking merge)

**Estimated Time to Full Validation**: 2-4 hours
**Blocking Issues**: None identified yet (pending local testing)
