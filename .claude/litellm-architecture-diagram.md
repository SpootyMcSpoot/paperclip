# LiteLLM Integration Architecture Diagram

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         User Browser                                  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │         Development Workspace (React)                          │  │
│  │                                                                │  │
│  │  ┌─────────────────┐        ┌───────────────────────────┐    │  │
│  │  │  Monaco Editor  │        │     Agent Chat Panel      │    │  │
│  │  │                 │        │                           │    │  │
│  │  │  - TypeScript   │        │  - Model selector         │    │  │
│  │  │  - Syntax HL    │        │  - Streaming messages     │    │  │
│  │  │  - Autocomplete │        │  - Token usage display    │    │  │
│  │  │  - Diff view    │        │  - Error handling         │    │  │
│  │  └─────────────────┘        └───────────┬───────────────┘    │  │
│  │                                          │                    │  │
│  │                                          ▼                    │  │
│  │                              ┌──────────────────────┐         │  │
│  │                              │ litellmApi client    │         │  │
│  │                              │ (ui/src/api/)        │         │  │
│  │                              │                      │         │  │
│  │                              │ - chatCompletionStream() │     │  │
│  │                              │ - Error handling     │         │  │
│  │                              │ - SSE parsing        │         │  │
│  │                              └──────────┬───────────┘         │  │
│  └─────────────────────────────────────────┼────────────────────┘  │
└────────────────────────────────────────────┼───────────────────────┘
                                             │
                                             │ HTTPS (Fetch API)
                                             │
                     ┌───────────────────────▼───────────────────────┐
                     │         Kubernetes Cluster (STAX)             │
                     │                                               │
                     │  ┌─────────────────────────────────────────┐ │
                     │  │   LiteLLM Gateway (llm namespace)       │ │
                     │  │   http://litellm.llm.svc.cluster.local  │ │
                     │  │                                         │ │
                     │  │  - OpenAI-compatible API                │ │
                     │  │  - Load balancing (least-busy)          │ │
                     │  │  - Fallback chains                      │ │
                     │  │  - Redis caching                        │ │
                     │  │  - Langfuse observability               │ │
                     │  └───────────┬─────────────────────────────┘ │
                     │              │                                │
                     │              ▼                                │
                     │  ┌──────────────────────────────────────────┐│
                     │  │   Model Router (LiteLLM)                 ││
                     │  │                                          ││
                     │  │   Model Selection Logic:                 ││
                     │  │   - qwen35-coder → vLLM Spark            ││
                     │  │   - reasoning    → Ollama (spark)        ││
                     │  │   - fast         → Ollama (gpu02)        ││
                     │  │   - qwen3-vl     → Ollama (gpu02)        ││
                     │  └───────┬────────────────┬─────────────────┘│
                     │          │                │                   │
                     │          ▼                ▼                   │
                     │  ┌───────────────┐  ┌──────────────────┐    │
                     │  │  vLLM Spark   │  │  Ollama Instances│    │
                     │  │  (DGX GPU)    │  │  (gpu01/gpu02)   │    │
                     │  │               │  │                  │    │
                     │  │  Qwen3.5-122B │  │  Qwen3 8B/14B    │    │
                     │  │  (primary)    │  │  QwQ-32B         │    │
                     │  │               │  │  DeepSeek-R1     │    │
                     │  │  Priority: 0  │  │  Qwen3-VL        │    │
                     │  │  (fastest)    │  │  (fallback)      │    │
                     │  └───────────────┘  └──────────────────┘    │
                     │                                               │
                     └───────────────────────────────────────────────┘
```

---

## Request Flow (Streaming Chat)

```
1. User types message
   │
   ▼
2. Development.tsx handleSendMessage()
   ├─ Add user message to chat
   ├─ Add assistant placeholder
   └─ Call litellmApi.chatCompletionStream()
      │
      ▼
3. litellmApi client (ui/src/api/litellm.ts)
   ├─ Build request payload
   │  {
   │    model: "qwen35-coder",
   │    messages: [...chatHistory],
   │    temperature: 0.1,
   │    max_tokens: 16384,
   │    stream: true
   │  }
   ├─ POST to http://litellm.llm.svc.cluster.local:4000/v1/chat/completions
   └─ Parse SSE stream with ReadableStream API
      │
      ▼
4. LiteLLM Gateway (Kubernetes)
   ├─ Authenticate request (optional: API key)
   ├─ Route to model backend (qwen35-coder → vLLM Spark)
   ├─ Apply model tuning parameters
   │  (temperature: 0.1, top_p: 0.95, top_k: 40)
   └─ Stream response as SSE chunks
      │
      ▼
5. vLLM Spark Backend (DGX GPU)
   ├─ Load Qwen3.5-Coder-122B model
   ├─ Generate tokens with thinking mode
   ├─ Stream tokens back to LiteLLM
   └─ Handle fallback on failure (least-busy routing)
      │
      ▼
6. LiteLLM Gateway forwards SSE
   data: {"choices":[{"delta":{"content":"Hello"}}]}
   data: {"choices":[{"delta":{"content":" world"}}]}
   data: [DONE]
      │
      ▼
7. litellmApi client parses chunks
   for await (const chunk of stream) {
     const delta = chunk.choices[0]?.delta.content;
     if (delta) yield delta;
   }
      │
      ▼
8. Development.tsx updates UI incrementally
   setChatMessages((prev) => [
     ...prev.slice(0, -1),
     { ...lastMsg, content: fullContent }
   ])
      │
      ▼
9. User sees streaming response in real-time
```

---

## Model Routing Decision Tree

```
                        ┌─────────────────────┐
                        │  User Message Input │
                        └──────────┬──────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   Intent Analysis             │
                    │   (regex pattern matching)    │
                    └──────────┬───────────────────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │             │
                 ▼             ▼             ▼
        ┌────────────┐  ┌────────────┐  ┌────────────┐
        │Architecture│  │Code Gen/   │  │Quick       │
        │Design      │  │Debug       │  │Question    │
        └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
              │               │               │
              ▼               ▼               ▼
     ┌────────────────┐ ┌───────────────┐ ┌──────────────┐
     │ reasoning      │ │ qwen35-coder  │ │ fast         │
     │ (QwQ-32B)      │ │ (Qwen3.5-122B)│ │ (Qwen3-8B)   │
     │ temp: 0.6      │ │ temp: 0.1     │ │ temp: 0.1    │
     │ thinking mode  │ │ deterministic │ │ low latency  │
     └────────────────┘ └───────────────┘ └──────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  LiteLLM Gateway │
                    │  Least-Busy      │
                    │  Routing         │
                    └──────────────────┘
```

---

## Fallback Chain

```
                     ┌─────────────────────┐
                     │  Primary Model      │
                     │  qwen35-coder       │
                     │  (vLLM Spark)       │
                     └──────────┬──────────┘
                                │
                   ┌────────────▼────────────┐
                   │  Backend Failed?        │
                   │  (503, timeout, etc)    │
                   └────┬────────────────┬───┘
                        │ No             │ Yes
                        ▼                ▼
                  ┌──────────┐    ┌────────────────┐
                  │ Success  │    │ Fallback #1:   │
                  │ Return   │    │ qwen3-coder    │
                  │ Response │    │ (vLLM Spark)   │
                  └──────────┘    └────────┬───────┘
                                           │
                              ┌────────────▼────────────┐
                              │  Backend Failed?        │
                              └────┬────────────────┬───┘
                                   │ No             │ Yes
                                   ▼                ▼
                             ┌──────────┐    ┌────────────────┐
                             │ Success  │    │ Fallback #2:   │
                             │ Return   │    │ qwen3-fast     │
                             │ Response │    │ (Ollama)       │
                             └──────────┘    └────────┬───────┘
                                                      │
                                         ┌────────────▼────────────┐
                                         │  Backend Failed?        │
                                         └────┬────────────────┬───┘
                                              │ No             │ Yes
                                              ▼                ▼
                                        ┌──────────┐    ┌────────────┐
                                        │ Success  │    │ Return     │
                                        │ Return   │    │ Error 503  │
                                        │ Response │    │ (All down) │
                                        └──────────┘    └────────────┘
```

---

## Component Hierarchy

```
Development.tsx (Main Component)
│
├── Toolbar
│   ├── ViewMode Buttons (Editor/Diff/Output)
│   └── Action Buttons (Copy/Save/Run)
│
├── Left Panel (Editor)
│   ├── Monaco Editor (viewMode: editor)
│   ├── DiffEditor (viewMode: diff)
│   └── Output Terminal (viewMode: output)
│
└── Right Panel (Agent Chat)
    ├── Chat Header
    │   ├── Title ("Agent Chat")
    │   ├── Model Selector (future: dropdown)
    │   └── Settings Button (future: advanced settings)
    │
    ├── Chat Messages Container
    │   ├── Message Bubble (user/assistant)
    │   ├── Timestamp
    │   └── Streaming Cursor (when isStreaming)
    │
    ├── Error Display (if chatError)
    │
    ├── Token Usage (future: token counts)
    │
    └── Chat Input
        ├── Text Input
        ├── Send/Stop Button
        └── Status Text
```

---

## Data Flow (State Management)

```
┌─────────────────────────────────────────────────────────────────┐
│                    React State (Development.tsx)                 │
│                                                                  │
│  chatMessages: ChatMessage[]                                    │
│  ├── { id, role, content, timestamp, isStreaming }              │
│  └── Updated incrementally during streaming                     │
│                                                                  │
│  chatInput: string                                              │
│  └── Cleared on send                                            │
│                                                                  │
│  isStreaming: boolean                                           │
│  └── Controls UI state (disable input, show Stop button)        │
│                                                                  │
│  chatError: string | null                                       │
│  └── Displays error message if LiteLLM fails                    │
│                                                                  │
│  abortControllerRef: AbortController | null                     │
│  └── Used to cancel streaming requests                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
                  ┌────────────────────────┐
                  │  litellmApi.stream()   │
                  └────────────┬───────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Try/Catch Block    │
                    └──────┬──────────┬───┘
                           │          │
                   Success │          │ Error
                           │          │
                           ▼          ▼
              ┌─────────────────┐  ┌────────────────────┐
              │ Update messages │  │ Catch error        │
              │ with content    │  │ Check type:        │
              │ Mark complete   │  │ - ApiError         │
              └─────────────────┘  │ - Network Error    │
                                   │ - Timeout          │
                                   └─────────┬──────────┘
                                             │
                                             ▼
                                   ┌────────────────────┐
                                   │ Display user-      │
                                   │ friendly error:    │
                                   │ - 503: "Backend    │
                                   │   unavailable"     │
                                   │ - 429: "Rate       │
                                   │   limited"         │
                                   │ - Timeout: "Request│
                                   │   timed out"       │
                                   └────────────────────┘
```

---

## Observability Stack

```
┌──────────────────────────────────────────────────────────────┐
│                    User Browser                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Development Workspace                                  │  │
│  │  - Frontend metrics (analytics.track)                  │  │
│  │  - Token usage tracking                                │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
          ┌────────────────────────────────────────┐
          │     LiteLLM Gateway (Kubernetes)       │
          │                                        │
          │  ┌──────────────────────────────────┐ │
          │  │  Langfuse Callbacks              │ │
          │  │  - success_callback: ["langfuse"]│ │
          │  │  - failure_callback: ["langfuse"]│ │
          │  └──────────────┬───────────────────┘ │
          └─────────────────┼──────────────────────┘
                            │
                            ▼
          ┌────────────────────────────────────────┐
          │   Langfuse (llm namespace)             │
          │   https://langfuse.spooty.io           │
          │                                        │
          │   Metrics:                             │
          │   - Latency (p50, p95, p99)            │
          │   - Token usage per request            │
          │   - Error rates by model               │
          │   - Cost tracking                      │
          └────────────────────────────────────────┘
                            │
                            ▼
          ┌────────────────────────────────────────┐
          │   Prometheus + Grafana                 │
          │   (monitoring namespace)               │
          │                                        │
          │   Dashboards:                          │
          │   - Requests/sec by model              │
          │   - Latency histograms                 │
          │   - Error rates                        │
          │   - Cache hit rates                    │
          └────────────────────────────────────────┘
```

---

## Security Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                 Production Deployment                         │
│                                                               │
│  Browser (staple.spooty.io)                                  │
│       │                                                       │
│       ▼                                                       │
│  ┌─────────────────────────────────┐                        │
│  │  Staple Backend (Optional)      │                        │
│  │  /api/chat/completions          │                        │
│  │                                 │                        │
│  │  - Validates user session       │                        │
│  │  - Injects API key (server-side)│                        │
│  │  - Rate limiting per user       │                        │
│  │  - Usage logging to DB          │                        │
│  └───────────────┬─────────────────┘                        │
│                  │                                            │
│                  ▼                                            │
│  ┌─────────────────────────────────────────┐                │
│  │  LiteLLM Gateway (internal cluster DNS) │                │
│  │  http://litellm.llm.svc.cluster.local   │                │
│  │                                         │                │
│  │  - No public ingress (internal only)    │                │
│  │  - Optional: LITELLM_MASTER_KEY         │                │
│  │  - RBAC per model (future)              │                │
│  └─────────────────────────────────────────┘                │
│                                                               │
└───────────────────────────────────────────────────────────────┘

Alternative: Direct Frontend Access (Development Only)

┌──────────────────────────────────────────────────────────────┐
│                 Development Setup                             │
│                                                               │
│  Browser (localhost:5173)                                    │
│       │                                                       │
│       ▼                                                       │
│  kubectl port-forward                                        │
│  └─ localhost:4000 → litellm.llm:4000                       │
│       │                                                       │
│       ▼                                                       │
│  ┌─────────────────────────────────────┐                    │
│  │  LiteLLM Gateway                    │                    │
│  │  http://localhost:4000              │                    │
│  │                                     │                    │
│  │  - No auth required (local)         │                    │
│  │  - Direct API access for testing    │                    │
│  └─────────────────────────────────────┘                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Performance Optimization

```
┌──────────────────────────────────────────────────────────────┐
│                      Optimization Stack                       │
│                                                               │
│  1. Frontend (Browser)                                       │
│     ├─ Debounced input (500ms)                              │
│     ├─ Single concurrent request (abort previous)           │
│     └─ Incremental UI updates (React state batching)        │
│                                                               │
│  2. LiteLLM Gateway                                          │
│     ├─ Redis caching (TTL: 3600s)                           │
│     ├─ Least-busy routing (load balancing)                  │
│     ├─ Connection pooling                                   │
│     └─ Request timeout: 300s                                │
│                                                               │
│  3. Model Backends                                           │
│     ├─ vLLM Spark (priority 0 - fastest)                    │
│     │  └─ Continuous batching                               │
│     │  └─ FP16 inference                                    │
│     │  └─ KV cache optimization                             │
│     │                                                        │
│     └─ Ollama (fallback)                                    │
│        └─ Model preloading                                  │
│        └─ GPU memory pinning                                │
│                                                               │
│  Target Metrics:                                             │
│  - Time to first token: <3s                                 │
│  - Streaming latency: <100ms/token                          │
│  - Cache hit rate: >30%                                     │
│  - Backend availability: >95%                               │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                 Kubernetes Cluster (STAX)                     │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  staple namespace                                        ││
│  │  ┌────────────────────────────────────────────────────┐ ││
│  │  │  staple-ui Deployment                              │ ││
│  │  │  - Image: harbor.spooty.io/staple/ui:0.2.0         │ ││
│  │  │  - Replicas: 2                                     │ ││
│  │  │  - Environment:                                    │ ││
│  │  │    VITE_LITELLM_URL=http://litellm.llm:4000        │ ││
│  │  └────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  llm namespace                                           ││
│  │                                                          ││
│  │  ┌──────────────────────────────────────────────────┐  ││
│  │  │  LiteLLM Deployment                              │  ││
│  │  │  - Image: ghcr.io/berriai/litellm:main-latest    │  ││
│  │  │  - Replicas: 1                                   │  ││
│  │  │  - Service: litellm.llm.svc.cluster.local:4000   │  ││
│  │  │  - ConfigMap: litellm-config (model routing)     │  ││
│  │  │  - Secrets: litellm-credentials (API keys)       │  ││
│  │  └──────────────────────────────────────────────────┘  ││
│  │                                                          ││
│  │  ┌──────────────────────────────────────────────────┐  ││
│  │  │  vLLM Spark StatefulSet (DGX GPU)                │  ││
│  │  │  - Model: Qwen3.5-Coder-122B                     │  ││
│  │  │  - GPU: 1x NVIDIA GB10 (128GB VRAM)              │  ││
│  │  │  - Service: vllm-spark:8000                      │  ││
│  │  └──────────────────────────────────────────────────┘  ││
│  │                                                          ││
│  │  ┌──────────────────────────────────────────────────┐  ││
│  │  │  Ollama StatefulSet (gpu01/gpu02)                │  ││
│  │  │  - Models: Qwen3 8B/14B, QwQ-32B, DeepSeek-R1    │  ││
│  │  │  - GPU: 2x RTX 5060 Ti (32GB each)               │  ││
│  │  │  - Service: ollama-gpu02:11434                   │  ││
│  │  └──────────────────────────────────────────────────┘  ││
│  │                                                          ││
│  │  ┌──────────────────────────────────────────────────┐  ││
│  │  │  Redis StatefulSet (caching)                     │  ││
│  │  │  - Service: redis-ai-master:6379                 │  ││
│  │  └──────────────────────────────────────────────────┘  ││
│  │                                                          ││
│  │  ┌──────────────────────────────────────────────────┐  ││
│  │  │  Langfuse Deployment (observability)             │  ││
│  │  │  - Service: langfuse:3000                        │  ││
│  │  │  - Ingress: https://langfuse.spooty.io           │  ││
│  │  └──────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

This comprehensive diagram set shows the complete architecture from browser to backend, including all components, data flows, and infrastructure layers.
