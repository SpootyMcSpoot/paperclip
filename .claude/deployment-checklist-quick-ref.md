# Deployment Checklist - Quick Reference

Print this and keep it visible during development.

---

## Before Creating PR

### ☐ Step 1: Local Testing
```bash
pnpm --filter @stapleai/ui dev
# Open http://localhost:5173
# Test all functionality
# Check console (F12) - zero errors
```

### ☐ Step 2: Automated Tests
```bash
pnpm test        # All tests pass
pnpm lint        # Zero errors
pnpm format      # Code formatted
```

### ☐ Step 3: Version Bump
```bash
# package.json version bumped
# patch: bug fix
# minor: new feature
# major: breaking change
npm version [patch|minor|major]
git add package.json
git commit -m "chore: bump version"
```

### ☐ Step 4: Container Build
```bash
export VERSION=$(grep -oP '(?<="version": ")[^"]*' package.json)
export GIT_SHA=$(git rev-parse --short HEAD)

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t harbor.spooty.io/staple/ui:${VERSION} \
  -t harbor.spooty.io/staple/ui:${VERSION}-${GIT_SHA} \
  -t harbor.spooty.io/staple/ui:latest \
  --push \
  .

# Verify multiarch
podman manifest inspect harbor.spooty.io/staple/ui:${VERSION} | \
  jq -r '.manifests[] | "\(.platform.os)/\(.platform.architecture)"'
# Must show: linux/amd64 AND linux/arm64
```

### ☐ Step 5: Deploy
```bash
# Option A: Pulumi
cd infra && pulumi preview && pulumi up

# Option B: kubectl
kubectl set image deployment/staple-ui \
  staple-ui=harbor.spooty.io/staple/ui:${VERSION} -n staple
kubectl rollout status deployment/staple-ui -n staple
```

### ☐ Step 6: Kubernetes Validation
```bash
# Run validation script
./scripts/validate-deployment.sh staple-ui staple https://staple.spooty.io

# OR manual checks:
kubectl get deployment staple-ui -n staple     # READY X/X
kubectl get pods -n staple -l app=staple-ui    # Running, READY 1/1
kubectl get endpoints staple-ui -n staple      # Has IPs
kubectl logs -n staple -l app=staple-ui --tail=100  # No errors
```

### ☐ Step 7: Browser E2E Testing
```
1. Open browser
2. Navigate to https://staple.spooty.io
3. Login
4. Navigate to new/changed feature
5. Test ALL interactions
6. Open console (F12) - verify ZERO errors
7. Take screenshots
8. Test edge cases
```

### ☐ Step 8: Collect Evidence
```bash
# Save kubectl output
kubectl get all -n staple -l app=staple-ui > /tmp/k8s-validation.txt

# Save logs
kubectl logs -n staple -l app=staple-ui --tail=100 > /tmp/pod-logs.txt

# Save HTTP response
curl -sL https://staple.spooty.io | head -100 > /tmp/response.txt

# Screenshots:
# - feature-main-view.png
# - console-no-errors.png
# - interaction-test.png
```

### ☐ Step 9: Create PR
```bash
git push origin feature/your-branch
gh pr create --fill

# Attach evidence to PR:
# - Upload screenshots
# - Paste kubectl output
# - Paste validation results
```

### ☐ Step 10: Merge (After Approval)
```bash
gh pr checks [PR-NUMBER]     # All checks pass
gh pr merge [PR-NUMBER] --squash --delete-branch
```

---

## Red Flags (DO NOT CREATE PR IF ANY ARE TRUE)

- ❌ Haven't tested in dev server
- ❌ Haven't built container
- ❌ Haven't deployed to cluster
- ❌ Haven't tested in browser
- ❌ Browser console shows errors
- ❌ Pods not Running
- ❌ No screenshots captured
- ❌ Version not bumped
- ❌ Single-arch build (not multiarch)
- ❌ Tests failing

---

## Quick Validation Commands

```bash
# Deployment status
kubectl get deployment [name] -n [namespace]

# Pod status
kubectl get pods -n [namespace] -l app=[name]

# Logs
kubectl logs -n [namespace] -l app=[name] --tail=50

# Endpoints
kubectl get endpoints [name] -n [namespace]

# HTTP check
curl -sL [url] | head -50

# Validation script
./scripts/validate-deployment.sh [name] [namespace] [url]
```

---

## Common Mistakes

| Mistake | Correct Approach |
|---------|------------------|
| Create PR after tests pass | Create PR after deployment validates |
| kubectl shows Running = done | Running + browser test = done |
| Single arch build | Always multiarch (amd64,arm64) |
| Skip version bump | Always bump for functional changes |
| No screenshots | Always capture evidence |
| HTTP 200 = working | 200 + valid body + browser test = working |

---

## When Can You Skip Steps?

| Change Type | Can Skip |
|-------------|----------|
| Documentation only | Container build, deployment |
| Test-only | Deployment (tests run in CI) |
| Backend API | Browser UI testing (still need API testing) |
| Config only | Maybe container build (depends on location) |
| **All other changes** | **NOTHING - follow full workflow** |

---

## Emergency Rollback

```bash
# Rollback last deployment
kubectl rollout undo deployment/[name] -n [namespace]

# Verify rollback
kubectl rollout status deployment/[name] -n [namespace]

# Validate
./scripts/validate-deployment.sh [name] [namespace] [url]
```

---

## Key Files

- Full workflow: `docs/DEPLOYMENT-WORKFLOW.md`
- Gap analysis: `.claude/deployment-gap-analysis.md`
- PR template: `.github/PULL_REQUEST_TEMPLATE.md`
- Validation script: `scripts/validate-deployment.sh`

---

## Remember

**"Tests pass" ≠ "Feature complete"**

**Feature is complete when:**
✅ Code written
✅ Tests pass
✅ Container built (multiarch)
✅ Deployed to cluster
✅ Validated in browser
✅ Evidence collected

**DO NOT create PR until ALL 6 are complete.**

---

## Questions Before Each PR

1. Did I test this locally in dev server?
2. Did I build a multiarch container?
3. Did I deploy to the cluster?
4. Did I test in a real browser?
5. Did I check the console for errors?
6. Did I capture screenshots?
7. Did I bump the version?

**If ANY answer is "no", DO NOT create PR yet.**

---

**Print this page and keep it visible.**
