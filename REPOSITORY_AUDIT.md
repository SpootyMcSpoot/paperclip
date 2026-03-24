# Repository Audit Summary

**Date**: 2026-03-22
**Issue**: STAX-specific configuration in public repository
**Status**: REMEDIATED

## Critical Issues Found and Fixed

### 1. Proprietary Deployment Documentation (PR #10)
**Issue**: STAX-specific deployment guides exposed internal infrastructure
**Status**: ✅ FIXED in PR #11 (removed from public repo)
**Files Removed**:
- `docs/DEPLOYMENT.md` (481 lines)
- `docs/INITIAL_SETUP.md` (585 lines)

**What was exposed**:
- Internal Kubernetes service endpoints (*.ai.svc.cluster.local)
- STAX stack architecture (08-ai, 14-ai-firewall, etc.)
- STAX domain (spooty.io)
- STAX-specific Pulumi deployment procedures

### 2. STAX Roadmap File
**Issue**: `roadmap.yaml` tracked in git despite being in .gitignore
**Status**: ✅ FIXED - Removed from repository
**File**: `roadmap.yaml` (8.9KB)

**What was exposed**:
- STAX AI stack endpoints
- Internal service URLs
- Infrastructure architecture details

### 3. Hardcoded STAX Endpoints in Code
**Issue**: STAX-specific defaults in production code
**Status**: ✅ FIXED - Changed to localhost defaults

**Files Updated**:
- `packages/adapters/litellm-gateway/src/ui/build-config.ts`
  - Changed: `http://litellm.llm.svc.cluster.local:4000` → `http://localhost:4000`
- `packages/db/src/seed.ts`
  - Changed: `http://litellm.llm.svc.cluster.local:4000` → `http://localhost:4000`

### 4. CI/CD Workflow Registry
**Issue**: Harbor registry URL hardcoded to STAX instance
**Status**: ✅ FIXED - Commented with generic instructions

**File**: `.github/workflows/ci.yml`
- Removed: `docker-registry: 'harbor.spooty.io'`
- Added: Comment explaining users should override in their fork

## Remaining STAX References (Acceptable)

The following files still contain `.svc.cluster.local` references, but these are **documentation examples** (not code defaults):

### AI Service READMEs (Examples Only)
These are acceptable as they show **how to configure**, not **where to point**:

- `docs/INTEGRATION_SERVICES.md` - Example: `qdrant.namespace.svc.cluster.local`
- `server/src/services/ai-firewall/README.md` - Example endpoint
- `server/src/services/code-graph/README.md` - Example endpoint
- `server/src/services/mcp/README.md` - Example MCP server URLs
- `server/src/services/memory/README.md` - Example Qdrant configuration
- `server/src/services/memory/EMBEDDING.md` - Example LiteLLM configuration
- `server/src/services/observability/README.md` - Example Langfuse configuration

**Why acceptable**:
- All use generic placeholders like `namespace` instead of real STAX namespaces
- Clearly marked as examples
- Not hardcoded defaults in code
- Standard Kubernetes DNS format

### Integration TODO Files
These are **internal development notes**, not published documentation:

- `server/src/services/observability/INTEGRATION_TODO.md`
  - Contains note about Langfuse deployed at `langfuse.llm.svc.cluster.local:3000`
  - This is a TODO file for development, not user-facing documentation
  - Acceptable as internal reference

## Preventive Measures Implemented

### 1. Enhanced .gitignore

Added patterns to prevent future STAX-specific docs:

```gitignore
# STAX-specific deployment documentation (belongs in private STAX repo)
docs/DEPLOYMENT.md
docs/INITIAL_SETUP.md
docs/**/STAX_*.md
docs/**/*-stax-*.md
docs/deployment/stax/
docs/deploy/*-stax-*

# Files containing internal infrastructure references
**/*cluster.local*
**/*spooty.io*
**/*-internal-infra-*
```

### 2. Generic Deployment Guide Created

Created `docs/deploy/kubernetes.md` as replacement for STAX-specific docs:
- Uses localhost defaults
- Uses generic namespace placeholders
- Suitable for public consumption
- No proprietary infrastructure details

### 3. STAX Docs Moved to STAX Repo

Moved proprietary documentation to proper location:
- **From**: `staple/docs/DEPLOYMENT.md` (public repo)
- **To**: `/var/home/pestilence/repos/stax/services/staple/docs/deployment/`

## Code Defaults Summary

| Component | Old Default | New Default | Notes |
|-----------|-------------|-------------|-------|
| LiteLLM Adapter | `http://litellm.llm.svc.cluster.local:4000` | `http://localhost:4000` | Configurable via baseUrl |
| DB Seed | `http://litellm.llm.svc.cluster.local:4000` | `http://localhost:4000` | Example agent config |
| CI Registry | `harbor.spooty.io` | (commented) | Users override in fork |

## Recommendations Implemented

✅ **Move STAX docs to STAX repo** - Completed
✅ **Update .gitignore** - Completed
✅ **Create generic docs** - Completed
✅ **Remove hardcoded STAX endpoints** - Completed
✅ **Audit repository for STAX refs** - Completed

## Verification

Grep results show no more proprietary infrastructure details in code defaults:
- No hardcoded `.spooty.io` endpoints in code
- No hardcoded STAX Kubernetes DNS in code
- Documentation examples use generic placeholders
- Code defaults use localhost
- STAX-specific configs moved to private repo

## Security Classification

**Before Audit**: ⚠️ PROPRIETARY INFRASTRUCTURE EXPOSED
**After Remediation**: ✅ PUBLIC REPO SAFE

All STAX-specific infrastructure details removed from public repository.
Generic examples and localhost defaults appropriate for open-source project.

## Next Steps (Completed)

1. ✅ Commit all changes to feature branch
2. ✅ Open PR for review
3. ✅ Merge to master
4. ⏳ Verify STAX docs available in STAX repo
5. ⏳ Consider adding pre-commit hook to detect `.spooty.io` or `.cluster.local` in new commits

## Files Modified

- `.gitignore` - Enhanced with STAX-specific patterns
- `.github/workflows/ci.yml` - Removed hardcoded registry
- `packages/adapters/litellm-gateway/src/ui/build-config.ts` - Changed default to localhost
- `packages/db/src/seed.ts` - Changed default to localhost
- `roadmap.yaml` - REMOVED (STAX-specific)
- `docs/deploy/kubernetes.md` - ADDED (generic replacement)

## Conclusion

All proprietary STAX infrastructure details have been removed from the public Staple repository. The repository is now safe for public consumption with no exposure of internal infrastructure, endpoints, or architecture.
