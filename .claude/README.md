# Claude Session Documentation

This directory contains session-specific documentation, gap analyses, and deployment guides for the Staple AI (Staple) project.

---

## Quick Start

**New to deployment workflow?** Start here:
1. Read: `deployment-gap-summary.md` (5 min read)
2. Print: `deployment-checklist-quick-ref.md` (keep visible)
3. Reference: `../docs/DEPLOYMENT-WORKFLOW.md` when deploying

**Creating a PR?** Use this checklist:
1. `deployment-checklist-quick-ref.md` - verify all steps completed
2. `.github/PULL_REQUEST_TEMPLATE.md` - fill out PR template
3. `scripts/validate-deployment.sh` - run validation script

**Need details?** Read:
- `deployment-gap-analysis.md` - comprehensive incident analysis
- `deployment-validation-plan.md` - specific plan for PR #14

---

## Document Index

### Incident Analysis

#### `deployment-gap-analysis.md`
**Purpose**: Comprehensive analysis of PR #14 validation failure
**Contents**:
- Executive summary
- Timeline (actual vs. expected)
- Root cause analysis (7 failure modes)
- Impact assessment
- Gap analysis (knowledge, process, tooling, architecture)
- 20 corrective actions (prioritized)
- Lessons learned
- Success metrics
- Templates for future use

**Read when**: Understanding what went wrong and how to prevent it

#### `deployment-gap-summary.md`
**Purpose**: Executive summary for stakeholders
**Contents**:
- What happened
- Root cause (high level)
- Documents created
- Immediate/short/medium/long-term actions
- Key lessons learned
- Workflow violations (11 identified)
- Success metrics
- Next steps

**Read when**: Need quick overview or briefing leadership

### Deployment Guides

#### `deployment-validation-plan.md`
**Purpose**: Specific validation plan for PR #14
**Contents**:
- Current status (not deployed/validated)
- Testing strategy (local, container, deployment, browser)
- Model behavior validation
- LiteLLM model inventory
- Recommended model routing
- Workflow validation checklist

**Read when**: Completing PR #14 deployment

#### `deployment-checklist-quick-ref.md`
**Purpose**: One-page printable checklist
**Contents**:
- 10-step deployment workflow
- Red flags
- Quick validation commands
- Common mistakes
- When to skip steps
- Emergency rollback

**Read when**: Every time you create a PR (print and keep visible)

#### `SESSION-SUMMARY.md`
**Purpose**: Summary of gap analysis documentation session
**Contents**:
- What was done this session
- Incident summary
- Violations identified
- Corrective actions defined
- Files created
- Success metrics
- Next steps

**Read when**: Understanding what documentation was created and why

---

## Related Documentation

### In This Repo

| Location | Purpose |
|----------|---------|
| `.github/PULL_REQUEST_TEMPLATE.md` | Mandatory PR checklist (enforces workflow) |
| `docs/DEPLOYMENT-WORKFLOW.md` | Complete deployment workflow guide |
| `scripts/validate-deployment.sh` | Automated deployment validation script |

### Global Rules (User Config)

| Location | Purpose |
|----------|---------|
| `~/.claude/rules/validation.md` | Deployment validation protocol (MANDATORY) |
| `~/.claude/rules/container-versioning.md` | Container image versioning requirements |
| `~/.claude/rules/workflow.md` | Workflow gates and completion criteria |
| `~/.claude/rules/infrastructure.md` | Infrastructure standards (multiarch, Pulumi, etc.) |
| `~/.claude/rules/cicd.md` | CI/CD pipeline requirements |

---

## Key Concepts

### Deployment Workflow
```
Code → Test → Version Bump → Build (Multiarch) → Deploy → Validate → Evidence → PR → Merge
```

**DO NOT skip any step.**

### Validation Requirements

From `~/.claude/rules/validation.md`, ALL of these are REQUIRED:
1. Fetch and inspect response body
2. Playwright browser test (for UI changes)
3. Kubernetes resource validation
4. Browse to deployed URL
5. Test full user workflow
6. Verify specific error is gone (if fixing a bug)
7. Collect evidence (screenshots, logs)

**Completion Criteria**: Deployed and validated, not just "tests pass."

### Container Requirements

From `~/.claude/rules/container-versioning.md` and `~/.claude/rules/infrastructure.md`:
- **Version bump**: ALWAYS for functional changes (semver: patch/minor/major)
- **Multiarch**: ALWAYS `linux/amd64,linux/arm64` (cluster has both)
- **Registry**: ALWAYS push to Harbor (`harbor.spooty.io`)
- **Tags**: Version + SHA + latest (version is primary)

### Workflow Gates

From `~/.claude/rules/workflow.md`:
- **NEVER merge to main until deployed and validated**
- **NEVER declare work complete until deployed and validated**
- Full workflow: feature branch → CI passes → build → deploy → validate → THEN merge

---

## Common Mistakes

### Mistake 1: "Tests Pass" = "Done"
**Wrong**: Create PR immediately after tests pass.
**Right**: Tests → build → deploy → validate in browser → THEN PR.

### Mistake 2: Skipping Browser Testing
**Wrong**: Check `kubectl get pods`, see Running, declare success.
**Right**: Pods Running + browser test + zero console errors = success.

### Mistake 3: Single-Arch Builds
**Wrong**: `docker build` without `--platform`.
**Right**: `docker buildx build --platform linux/amd64,linux/arm64`.

### Mistake 4: No Version Bump
**Wrong**: Build with same version tag.
**Right**: Bump version before every build.

### Mistake 5: Trusting HTTP 200
**Wrong**: `curl` returns 200, declare success.
**Right**: 200 + valid body + browser test = success.

---

## Red Flags

DO NOT create PR if ANY of these are true:
- Haven't tested in dev server
- Haven't built container
- Haven't deployed to cluster
- Haven't tested in browser
- Browser console shows errors
- Pods not Running
- No screenshots captured
- Version not bumped
- Single-arch build
- Tests failing

---

## Emergency Procedures

### Rollback Deployment
```bash
kubectl rollout undo deployment/[name] -n [namespace]
kubectl rollout status deployment/[name] -n [namespace]
./scripts/validate-deployment.sh [name] [namespace] [url]
```

### Check Deployment Status
```bash
kubectl get all -n [namespace] -l app=[name]
kubectl logs -n [namespace] -l app=[name] --tail=100
kubectl describe pod [pod-name] -n [namespace]
```

### Validate Deployment
```bash
./scripts/validate-deployment.sh [service] [namespace] [url]
```

---

## Success Metrics

Track these monthly to verify corrective actions are working:

### Deployment Compliance
- PRs with deployment: Target 100%
- PRs with validation evidence: Target 100%
- PRs with multiarch images: Target 100%

### Validation Coverage
- Browser E2E tests: Target >80%
- Validation protocol compliance: Target 7/7 steps

### Process Maturity
- PRs blocked by branch protection: Target 100%
- CI/CD pipeline coverage: Target 100%
- Manual deployment steps: Target 0 (all automated)

**Review Date**: 2026-04-22 (monthly)

---

## Templates

### Pre-Deployment Checklist
See: `deployment-gap-analysis.md` → "Templates for Future Use" → "1. Pre-Deployment Checklist"

### Validation Evidence Template
See: `deployment-gap-analysis.md` → "Templates for Future Use" → "2. Validation Evidence Template"

### Deployment Failure Response
See: `deployment-gap-analysis.md` → "Templates for Future Use" → "3. Deployment Failure Response Template"

---

## Corrective Action Timeline

### Immediate (P0) - Today
- [ ] Complete PR #14 validation
- [ ] Check current Staple deployment
- [ ] Version bump to 0.2.0
- [ ] Build multiarch image
- [ ] Deploy to cluster
- [ ] Browser E2E validation
- [ ] Collect evidence

### Short-Term (P1) - This Week
- [ ] Document SPA deployment flow
- [ ] Create smoke test script
- [ ] Add Playwright E2E tests
- [ ] Update CONTRIBUTING.md

### Medium-Term (P2) - This Month
- [ ] Implement agent chat (LiteLLM)
- [ ] Add Langfuse observability
- [ ] Build CI/CD pipeline
- [ ] Add branch protection

### Long-Term (P3) - Next Quarter
- [ ] Dev environment automation
- [ ] Observability dashboards
- [ ] Load testing
- [ ] Multi-environment strategy

---

## Key Lessons

1. **Deployment is Part of Development** - 50% code, 50% deploy/validate
2. **Local Dev != Production** - Container behavior differs from dev server
3. **Tests Don't Prove User Workflows** - Browser testing is mandatory
4. **Context is Critical** - Check existing deployments first
5. **Validation Protocol is Mandatory** - All 7 steps required
6. **Multiarch is Non-Negotiable** - Cluster has amd64 + arm64 nodes
7. **Version Bumps Prevent Confusion** - Cache issues without versioning
8. **Evidence Builds Confidence** - Screenshots + logs prove validation

---

## Quick Commands

```bash
# Start dev server
pnpm --filter @stapleai/ui dev

# Run tests
pnpm test

# Build multiarch image
docker buildx build --platform linux/amd64,linux/arm64 -t harbor.spooty.io/staple/ui:[version] --push .

# Deploy
kubectl set image deployment/staple-ui staple-ui=harbor.spooty.io/staple/ui:[version] -n staple

# Validate
./scripts/validate-deployment.sh staple-ui staple https://staple.spooty.io

# Create PR
gh pr create --fill
```

---

## Contact

If you have questions about:
- **Deployment workflow**: Read `docs/DEPLOYMENT-WORKFLOW.md`
- **Validation failures**: Read `deployment-gap-analysis.md`
- **Quick reference**: Read `deployment-checklist-quick-ref.md`
- **PR requirements**: Read `.github/PULL_REQUEST_TEMPLATE.md`

---

## Document Updates

| Date | Document | Change |
|------|----------|--------|
| 2026-03-22 | All | Initial creation after PR #14 incident |

**Next Review**: 2026-04-22
