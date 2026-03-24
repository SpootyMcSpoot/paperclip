# LiteLLM Integration - PR #1 Implementation Guide

## Overview

Replace mock responses in Development workspace with real LLM inference using LiteLLM Gateway.

**Branch:** `feature/litellm-chat-integration`
**Target:** Basic streaming chat with fixed model (`qwen35-coder`)
**Estimated Time:** 10-17 hours

---

## Prerequisites

- [ ] LiteLLM Gateway running at `http://litellm.llm.svc.cluster.local:4000`
- [ ] Verify model availability: `curl http://litellm.llm.svc.cluster.local:4000/v1/models`
- [ ] Development workspace deployed and accessible

---

## Implementation Tasks

### Task 1: Create LiteLLM API Client (2-3 hours)

**File:** `ui/src/api/litellm.ts`

```typescript
import { ApiError } from "./client";

const LITELLM_BASE = import.meta.env.VITE_LITELLM_URL ||
                     "http://litellm.llm.svc.cluster.local:4000";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}

class LiteLLMClient {
  private baseUrl: string;

  constructor(baseUrl: string = LITELLM_BASE) {
    this.baseUrl = baseUrl;
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new ApiError(
        errorBody?.error?.message || `LiteLLM request failed: ${res.status}`,
        res.status,
        errorBody
      );
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            yield JSON.parse(data);
          } catch (e) {
            console.warn("Failed to parse SSE chunk:", e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const litellmApi = new LiteLLMClient();
```

**Checklist:**
- [ ] File created at `ui/src/api/litellm.ts`
- [ ] TypeScript types defined
- [ ] Streaming generator implemented
- [ ] Error handling with ApiError
- [ ] Export `litellmApi` instance

### Task 2: Update API Exports (5 minutes)

**File:** `ui/src/api/index.ts`

```typescript
// Add to existing exports
export { litellmApi } from "./litellm";
export type { ChatMessage, ChatCompletionRequest, ChatCompletionChunk } from "./litellm";
```

**Checklist:**
- [ ] Export litellmApi
- [ ] Export types

### Task 3: Add Environment Variable (5 minutes)

**File:** `.env.example`

```bash
# LiteLLM Gateway Configuration
VITE_LITELLM_URL=http://litellm.llm.svc.cluster.local:4000
```

**File:** `.env.local` (create if not exists)

```bash
# For local development with port-forward:
# kubectl port-forward -n llm svc/litellm 4000:4000
VITE_LITELLM_URL=http://localhost:4000
```

**Checklist:**
- [ ] `.env.example` updated
- [ ] `.env.local` created (gitignored)
- [ ] Document port-forward command

### Task 4: Integrate into Development.tsx (4-6 hours)

**File:** `ui/src/pages/Development.tsx`

**Step 4.1: Add Imports**

```typescript
import { litellmApi, type ChatMessage as LLMMessage } from "../api";
```

**Step 4.2: Update ChatMessage Interface**

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;  // NEW: track streaming state
}
```

**Step 4.3: Add State Variables**

```typescript
const [isStreaming, setIsStreaming] = useState<boolean>(false);
const [chatError, setChatError] = useState<string | null>(null);
const abortControllerRef = useRef<AbortController | null>(null);
```

**Step 4.4: Replace handleSendMessage**

```typescript
const handleSendMessage = async () => {
  if (!chatInput.trim() || isStreaming) return;

  // Add user message
  const userMessage: ChatMessage = {
    id: Date.now().toString(),
    role: "user",
    content: chatInput,
    timestamp: new Date(),
  };

  setChatMessages([...chatMessages, userMessage]);
  setChatInput("");
  setChatError(null);

  // Add placeholder for assistant response
  const assistantId = (Date.now() + 1).toString();
  const assistantPlaceholder: ChatMessage = {
    id: assistantId,
    role: "assistant",
    content: "",
    timestamp: new Date(),
    isStreaming: true,
  };
  setChatMessages((prev) => [...prev, assistantPlaceholder]);

  // Start streaming
  setIsStreaming(true);
  const controller = new AbortController();
  abortControllerRef.current = controller;

  try {
    const stream = litellmApi.chatCompletionStream({
      model: "qwen35-coder",
      messages: [
        {
          role: "system",
          content: "You are a helpful coding assistant in the Development workspace. Provide concise, accurate code help.",
        },
        ...chatMessages.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: chatInput },
      ],
      temperature: 0.1,
      max_tokens: 16384,
    });

    let fullContent = "";

    for await (const chunk of stream) {
      if (controller.signal.aborted) break;

      const delta = chunk.choices[0]?.delta.content;
      if (delta) {
        fullContent += delta;

        // Update assistant message incrementally
        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: fullContent }
              : msg
          )
        );
      }
    }

    // Mark streaming complete
    setChatMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantId
          ? { ...msg, isStreaming: false }
          : msg
      )
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "An unexpected error occurred";
    setChatError(errorMsg);

    // Remove placeholder on error
    setChatMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
  } finally {
    setIsStreaming(false);
    abortControllerRef.current = null;
  }
};
```

**Step 4.5: Add Abort Handler**

```typescript
const handleAbortStreaming = () => {
  abortControllerRef.current?.abort();
  setIsStreaming(false);
};
```

**Step 4.6: Update Chat Input UI**

```typescript
{/* Chat Input */}
<div className="border-t border-border p-4">
  <div className="flex gap-2">
    <input
      type="text"
      placeholder="Ask the agent for help..."
      value={chatInput}
      onChange={(e) => setChatInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      }}
      disabled={isStreaming}
      className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
    />

    {isStreaming ? (
      <Button
        size="sm"
        variant="destructive"
        onClick={handleAbortStreaming}
      >
        Stop
      </Button>
    ) : (
      <Button size="sm" onClick={handleSendMessage}>
        Send
      </Button>
    )}
  </div>

  {/* Error Display */}
  {chatError && (
    <div className="mt-2 text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">
      Error: {chatError}
    </div>
  )}

  <p className="mt-2 text-xs text-muted-foreground">
    {isStreaming
      ? "Generating response..."
      : "Press Enter to send, Shift+Enter for new line"
    }
  </p>
</div>
```

**Step 4.7: Add Streaming Indicator**

```typescript
{/* Chat Messages */}
<div className="flex-1 overflow-auto p-4 space-y-4">
  {chatMessages.map((message) => (
    <div
      key={message.id}
      className={cn(
        "flex flex-col gap-1",
        message.role === "user" ? "items-end" : "items-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {message.content}

        {/* Streaming cursor */}
        {message.isStreaming && (
          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1"></span>
        )}
      </div>

      <span className="text-xs text-muted-foreground">
        {message.timestamp.toLocaleTimeString()}
      </span>
    </div>
  ))}
</div>
```

**Checklist:**
- [ ] Imports added
- [ ] ChatMessage interface updated
- [ ] State variables added
- [ ] handleSendMessage replaced with streaming logic
- [ ] Abort handler added
- [ ] UI updated (Stop button, error display, streaming cursor)
- [ ] TypeScript compiles without errors

### Task 5: Local Testing (2-3 hours)

**Step 5.1: Port-Forward LiteLLM**

```bash
kubectl port-forward -n llm svc/litellm 4000:4000
```

**Step 5.2: Start Dev Server**

```bash
cd /home/pestilence/repos/personal/staple-ai
pnpm --filter @stapleai/ui dev
```

**Step 5.3: Test Chat Functionality**

Navigate to `http://localhost:5173/{company}/development`

**Test Cases:**
- [ ] Page loads without errors
- [ ] Type "Write a function to add two numbers" and send
- [ ] Verify streaming response appears token-by-token
- [ ] Verify final message appears in chat history
- [ ] Verify streaming cursor animates during generation
- [ ] Click "Stop" button mid-generation and verify abort works
- [ ] Test error handling by stopping LiteLLM pod
- [ ] Verify error message displays in chat
- [ ] Test with long message (>1000 chars)
- [ ] Test with code snippet in message
- [ ] Check browser console for errors (should be none)

**Step 5.4: Performance Testing**

- [ ] Send 5 messages in quick succession
- [ ] Verify UI remains responsive
- [ ] Monitor network tab for SSE stream
- [ ] Check memory usage (DevTools)

**Step 5.5: Browser Compatibility**

- [ ] Test in Chrome/Chromium
- [ ] Test in Firefox
- [ ] Test in Safari (if available)

**Checklist:**
- [ ] All test cases pass
- [ ] No console errors
- [ ] Performance acceptable (<3s to first token)
- [ ] Streaming works in all browsers

### Task 6: Documentation (1 hour)

**Update:** `doc/development-workspace.md` (create if not exists)

```markdown
# Development Workspace

## Agent Chat

The Development workspace includes an AI-powered chat assistant using LiteLLM Gateway.

### Model

Currently uses `qwen35-coder` (Qwen 3.5 Coder 122B) via vLLM Spark for optimal coding assistance.

### Configuration

Set the LiteLLM URL in `.env.local`:

```bash
VITE_LITELLM_URL=http://litellm.llm.svc.cluster.local:4000
```

For local development with port-forwarding:

```bash
kubectl port-forward -n llm svc/litellm 4000:4000
VITE_LITELLM_URL=http://localhost:4000
```

### Usage

1. Type your coding question in the chat input
2. Press Enter to send (or Shift+Enter for multi-line)
3. Response streams in real-time
4. Click "Stop" to abort generation

### Limitations

- Fixed model (qwen35-coder)
- No model selection dropdown (coming in future PR)
- No advanced settings (temperature, max tokens)
- No token usage tracking (coming in future PR)
```

**Update:** `CHANGELOG.md`

```markdown
## [Unreleased]

### Added
- LiteLLM Gateway integration for Development workspace agent chat
- Real-time streaming chat responses using qwen35-coder model
- Abort button to stop generation mid-stream
- Error handling for LLM backend failures
```

**Checklist:**
- [ ] Documentation created
- [ ] CHANGELOG updated
- [ ] README updated (if needed)

### Task 7: Commit & Push (30 minutes)

```bash
git checkout -b feature/litellm-chat-integration

# Add files
git add ui/src/api/litellm.ts
git add ui/src/api/index.ts
git add ui/src/pages/Development.tsx
git add .env.example
git add doc/development-workspace.md
git add CHANGELOG.md

# Commit
git commit -m "feat(ui): integrate LiteLLM Gateway for Development workspace chat

- Add LiteLLM API client with streaming support
- Replace mock chat responses with real qwen35-coder model
- Implement real-time streaming message updates
- Add abort button to stop generation
- Add error handling for backend failures

Closes #XX"

# Push
git push -u origin feature/litellm-chat-integration
```

**Checklist:**
- [ ] Branch created
- [ ] All files committed
- [ ] Commit message follows convention
- [ ] Pushed to remote

---

## Deployment & Validation

### Step 1: Container Build (30 minutes)

```bash
cd /home/pestilence/repos/personal/staple-ai

# Bump version in ui/package.json
# Current: "0.1.0" → New: "0.2.0"
sed -i 's/"version": "0.1.0"/"version": "0.2.0"/' ui/package.json

# Build multiarch image
GIT_SHA=$(git rev-parse --short HEAD)
VERSION="0.2.0"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t harbor.spooty.io/staple/ui:${VERSION} \
  -t harbor.spooty.io/staple/ui:${VERSION}-${GIT_SHA} \
  -t harbor.spooty.io/staple/ui:latest \
  --push \
  ./ui

# Verify multiarch
podman manifest inspect harbor.spooty.io/staple/ui:${VERSION} | \
  jq -r '.manifests[] | "\(.platform.os)/\(.platform.architecture)"'
```

**Checklist:**
- [ ] Version bumped in package.json
- [ ] Image built for amd64 and arm64
- [ ] Image pushed to Harbor
- [ ] Manifest verified

### Step 2: Deploy to Cluster (30 minutes)

```bash
cd /home/pestilence/repos/personal/staple-ai/infra  # If Pulumi exists

# Update image tag in Pulumi code
# Then:
pulumi preview
pulumi up

# OR manual kubectl deployment
kubectl set image deployment/staple-ui staple-ui=harbor.spooty.io/staple/ui:0.2.0 -n staple
```

**Checklist:**
- [ ] Deployment updated
- [ ] Pods running (kubectl get pods -n staple)
- [ ] No errors in logs (kubectl logs -n staple -l app=staple-ui)

### Step 3: Browser E2E Validation (1 hour)

**Full User Workflow:**

1. **Navigate** to `https://staple.spooty.io/{company}/development`
2. **Login** (if required)
3. **Load Page:**
   - [ ] Page renders without errors
   - [ ] Monaco Editor loads
   - [ ] Chat panel visible
   - [ ] No console errors (F12)

4. **Test Chat:**
   - [ ] Type "Write a function to reverse a string"
   - [ ] Press Enter
   - [ ] Verify streaming response appears
   - [ ] Verify message completes successfully
   - [ ] Check timestamp displays

5. **Test Abort:**
   - [ ] Type "Explain the history of computer science"
   - [ ] Press Enter
   - [ ] Click "Stop" after 2 seconds
   - [ ] Verify generation stops
   - [ ] Verify partial message remains in chat

6. **Test Error Handling:**
   - [ ] Scale LiteLLM to 0 replicas: `kubectl scale deployment litellm -n llm --replicas=0`
   - [ ] Send a chat message
   - [ ] Verify error message displays
   - [ ] Verify graceful degradation
   - [ ] Scale back to 1: `kubectl scale deployment litellm -n llm --replicas=1`

7. **Performance:**
   - [ ] Send 3 messages back-to-back
   - [ ] Verify all responses stream correctly
   - [ ] Monitor network tab (SSE streams)
   - [ ] Check browser memory usage

8. **Screenshots:**
   - [ ] Take screenshot of chat working
   - [ ] Take screenshot of streaming in progress
   - [ ] Take screenshot of error state
   - [ ] Save to `doc/screenshots/`

**Checklist:**
- [ ] All validation tests pass
- [ ] No errors in browser console
- [ ] No errors in pod logs
- [ ] Screenshots captured

### Step 4: Create Pull Request (30 minutes)

```bash
gh pr create \
  --title "feat(ui): Integrate LiteLLM Gateway for Development workspace chat" \
  --body "$(cat <<'EOF'
## Summary

Replaces mock responses in Development workspace agent chat with real LLM inference using LiteLLM Gateway.

## Changes

- Add LiteLLM API client (`ui/src/api/litellm.ts`) with streaming support
- Update `Development.tsx` to use real qwen35-coder model
- Implement real-time streaming message updates
- Add abort button to stop generation
- Add error handling for backend failures
- Add documentation

## Model Configuration

- Model: `qwen35-coder` (Qwen 3.5 Coder 122B via vLLM Spark)
- Temperature: 0.1 (deterministic for code generation)
- Max tokens: 16384
- Streaming: Enabled

## Testing

### Local Testing
- [x] Chat sends message to LiteLLM
- [x] Streaming response updates UI incrementally
- [x] Abort button stops generation
- [x] Error handling shows user-friendly messages
- [x] No console errors

### Deployment Validation
- [x] Container built (multiarch: amd64, arm64)
- [x] Deployed to cluster (version: 0.2.0)
- [x] Browser E2E testing (all workflows pass)
- [x] Screenshots captured

## Screenshots

![Chat streaming](doc/screenshots/chat-streaming.png)
![Error handling](doc/screenshots/chat-error.png)

## Future Work (Out of Scope)

- Model selector dropdown
- Advanced settings (temperature, max tokens)
- Token usage tracking
- Intelligent model routing
- Backend proxy endpoint

## Related Issues

Closes #XX

## Checklist

- [x] Code compiles (TypeScript)
- [x] Local testing complete
- [x] Container built and pushed
- [x] Deployed to cluster
- [x] Browser E2E validation complete
- [x] Documentation updated
- [x] CHANGELOG updated
- [x] Screenshots added
EOF
)" \
  --base main
```

**Checklist:**
- [ ] PR created
- [ ] Description complete
- [ ] Screenshots attached
- [ ] Checklist filled out

### Step 5: Merge to Main (after approval)

```bash
# Wait for CI to pass
gh pr checks

# Merge
gh pr merge --squash --delete-branch
```

**Checklist:**
- [ ] CI passes
- [ ] Reviewed and approved
- [ ] Merged to main
- [ ] Branch deleted

---

## Success Criteria

The PR is ready to merge when:

1. **Code Quality:**
   - [ ] TypeScript compiles without errors
   - [ ] No linting errors
   - [ ] No console errors in browser

2. **Functionality:**
   - [ ] Chat sends message to LiteLLM Gateway
   - [ ] Streaming response updates UI incrementally
   - [ ] Final message appears in chat history
   - [ ] Abort button stops generation
   - [ ] Error states display user-friendly messages

3. **Performance:**
   - [ ] Time to first token < 3 seconds
   - [ ] Streaming smooth (no lag)
   - [ ] UI remains responsive during generation

4. **Deployment:**
   - [ ] Container built (multiarch)
   - [ ] Deployed to cluster (semantic version)
   - [ ] Pods running without errors
   - [ ] Browser E2E validation complete

5. **Documentation:**
   - [ ] README/docs updated
   - [ ] CHANGELOG updated
   - [ ] Screenshots added
   - [ ] Environment variables documented

---

## Troubleshooting

### Issue: "Failed to fetch" error

**Cause:** LiteLLM Gateway not reachable

**Fix:**
```bash
# Check LiteLLM is running
kubectl get pods -n llm -l app=litellm

# Port-forward for local testing
kubectl port-forward -n llm svc/litellm 4000:4000

# Update .env.local
VITE_LITELLM_URL=http://localhost:4000
```

### Issue: Streaming not working

**Cause:** Browser doesn't support ReadableStream

**Fix:**
- Ensure modern browser (Chrome 89+, Firefox 100+, Safari 14.1+)
- Check browser console for errors
- Verify SSE endpoint returns `Content-Type: text/event-stream`

### Issue: Response timeout

**Cause:** LiteLLM backend slow or unavailable

**Fix:**
```bash
# Check LiteLLM logs
kubectl logs -n llm -l app=litellm --tail=100

# Check backend vLLM is running
kubectl get pods -n llm -l app=vllm

# Test endpoint directly
curl -X POST http://litellm.llm.svc.cluster.local:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen35-coder",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
```

### Issue: TypeScript errors

**Cause:** Missing types or incorrect import

**Fix:**
```bash
# Rebuild TypeScript
cd ui
pnpm run typecheck

# Check for errors in output
# Fix type mismatches in Development.tsx
```

---

## Time Tracking

| Task | Estimated | Actual |
|------|-----------|--------|
| API Client | 2-3h | |
| Integration | 4-6h | |
| Local Testing | 2-3h | |
| Documentation | 1h | |
| Deployment | 2h | |
| Validation | 1-2h | |
| **Total** | **12-17h** | |

---

## Next Steps (Future PRs)

After this PR merges:

**PR #2: Advanced Features**
- Model selector dropdown
- Advanced settings panel (temperature, max tokens)
- Token usage tracking
- Intelligent model routing

**PR #3: Backend Proxy**
- Add `/api/chat/completions` endpoint
- Server-side API key injection
- Usage logging to database
- Per-user rate limiting

**PR #4: Code Context Integration**
- Send editor code to model
- Inline code suggestions
- Multi-turn sessions with history
- Vision model for screenshots
