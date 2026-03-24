# LiteLLM Integration - Quick Reference

## Key Resources

1. **Architecture Document:** `.claude/litellm-integration-architecture.md`
   - Complete technical design
   - Model inventory and routing strategy
   - API client architecture
   - UI implementation plan

2. **Implementation Guide:** `.claude/litellm-pr1-implementation-guide.md`
   - Step-by-step PR #1 tasks
   - Testing checklist
   - Deployment validation
   - Troubleshooting

---

## Quick Facts

**LiteLLM Gateway:**
- Internal: `http://litellm.llm.svc.cluster.local:4000`
- External: `https://litellm-api.spooty.io` (API key required)

**Primary Model:**
- ID: `qwen35-coder`
- Backend: Qwen 3.5 Coder 122B via vLLM Spark
- Temperature: 0.1 (deterministic)
- Max tokens: 16384

**Available Models (subset):**
- `qwen35-coder` - Coding (122B, vLLM Spark)
- `reasoning` - Architecture design (QwQ-32B, Ollama)
- `fast` - Quick responses (Qwen3-8B, Ollama)
- `qwen3-vl` - Screenshot analysis (32B VL, Ollama)

---

## Model Selection Logic

```
User asks about architecture → reasoning (QwQ-32B, temp=0.6)
User asks to write code     → qwen35-coder (122B, temp=0.1)
User asks to debug          → qwen35-coder (122B, temp=0.1)
User asks quick question    → fast (8B, temp=0.1)
Default                     → qwen35-coder
```

---

## Implementation Checklist (PR #1)

### Files to Create
- [ ] `ui/src/api/litellm.ts` - API client with streaming
- [ ] `doc/development-workspace.md` - User documentation

### Files to Modify
- [ ] `ui/src/api/index.ts` - Export litellmApi
- [ ] `ui/src/pages/Development.tsx` - Replace mock with real LLM
- [ ] `.env.example` - Add VITE_LITELLM_URL
- [ ] `CHANGELOG.md` - Document changes

### Key Features
- [x] Streaming chat responses (SSE)
- [x] Real-time message updates
- [x] Abort button to stop generation
- [x] Error handling (503, timeout, network)
- [x] Fixed model (qwen35-coder)

### Out of Scope (Future PRs)
- [ ] Model selector dropdown
- [ ] Advanced settings (temperature, max tokens)
- [ ] Token usage tracking
- [ ] Intelligent model routing
- [ ] Backend proxy endpoint

---

## Local Testing Setup

```bash
# Terminal 1: Port-forward LiteLLM
kubectl port-forward -n llm svc/litellm 4000:4000

# Terminal 2: Start dev server
cd /home/pestilence/repos/personal/staple-ai
pnpm --filter @stapleai/ui dev

# Browser: http://localhost:5173/{company}/development
```

---

## Deployment Commands

```bash
# Bump version
VERSION="0.2.0"
GIT_SHA=$(git rev-parse --short HEAD)

# Build multiarch image
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t harbor.spooty.io/staple/ui:${VERSION} \
  -t harbor.spooty.io/staple/ui:${VERSION}-${GIT_SHA} \
  -t harbor.spooty.io/staple/ui:latest \
  --push \
  ./ui

# Deploy
kubectl set image deployment/staple-ui \
  staple-ui=harbor.spooty.io/staple/ui:${VERSION} \
  -n staple
```

---

## Validation Tests

**Functional:**
- [ ] Chat sends message → streaming response appears
- [ ] Stop button aborts generation
- [ ] Error states display user-friendly messages
- [ ] Multiple messages work correctly

**Performance:**
- [ ] Time to first token < 3 seconds
- [ ] Streaming smooth (no lag)
- [ ] UI responsive during generation

**Browser:**
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari (if available)

**Deployment:**
- [ ] Pods running without errors
- [ ] No console errors in browser
- [ ] No errors in pod logs

---

## Troubleshooting Quick Fixes

**"Failed to fetch"**
```bash
kubectl get pods -n llm -l app=litellm
kubectl port-forward -n llm svc/litellm 4000:4000
```

**Streaming not working**
- Check browser version (Chrome 89+, Firefox 100+)
- Verify SSE Content-Type header
- Check browser console for errors

**Response timeout**
```bash
kubectl logs -n llm -l app=litellm --tail=100
kubectl get pods -n llm -l app=vllm
```

---

## Next PRs

**PR #2: Advanced Features (8-12 hours)**
- Model selector dropdown
- Advanced settings panel
- Token usage tracking
- Intelligent model routing

**PR #3: Backend Proxy (6-10 hours)**
- Server-side API endpoint
- Secure API key injection
- Usage logging
- Rate limiting

**PR #4: Code Context (8-12 hours)**
- Send editor code to model
- Inline code suggestions
- Multi-turn sessions
- Vision model integration

---

## Dependencies

**NPM Packages:** None (uses native Fetch API)

**Environment Variables:**
```bash
VITE_LITELLM_URL=http://litellm.llm.svc.cluster.local:4000
```

**Infrastructure:**
- LiteLLM Gateway (already deployed)
- vLLM Spark backend (already running)
- Ollama instances (already running)

---

## Success Metrics

- Chat response latency < 3s (first token)
- 95%+ uptime for LiteLLM Gateway
- Zero console errors in production
- User satisfaction (qualitative feedback)

---

## Time Estimates

**PR #1 Total:** 10-17 hours
- API Client: 2-3h
- Integration: 4-6h
- Local Testing: 2-3h
- Documentation: 1h
- Deployment: 2h

**Future PRs Total:** 22-34 hours
- PR #2: 8-12h
- PR #3: 6-10h
- PR #4: 8-12h

**Grand Total:** 32-51 hours
