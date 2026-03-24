# Deployment Workflow Guide

This document defines the complete workflow for deploying changes to Staple (Staple AI). Following this workflow is MANDATORY for all code changes that affect runtime behavior.

---

## Quick Reference

```
Code → Test → Build → Deploy → Validate → Merge
```

**Do NOT skip any step.** "Tests pass" is NOT "deployment complete."

---

## Why This Workflow Exists

Staple is a containerized application running on Kubernetes. Changes to the code require:
1. Building a new container image
2. Deploying the image to the cluster
3. Validating the deployment in a browser

**Local dev server (Vite) behavior != production container behavior.**

---

## The Complete Workflow

### Step 1: Local Development

```bash
cd /home/pestilence/repos/personal/staple-ai

# Start dev server
pnpm --filter @stapleai/ui dev

# Open browser to http://localhost:5173
# Test your changes
# Verify no console errors (F12)
```

**Validation Checklist**:
- [ ] Feature works as expected
- [ ] Zero errors in browser console
- [ ] UI renders correctly
- [ ] All interactions tested

---

### Step 2: Automated Testing

```bash
# Run all tests
pnpm test

# Run linter
pnpm lint

# Format code
pnpm format
```

**Validation Checklist**:
- [ ] All tests pass (410/410 or similar)
- [ ] Zero linting errors
- [ ] Zero TypeScript compilation errors
- [ ] Code formatted consistently

---

### Step 3: Version Bump (Required)

**ALWAYS bump the version for ANY functional change.**

```bash
cd /home/pestilence/repos/personal/staple-ai/ui

# Check current version
grep '"version"' package.json

# Decide bump type:
# - patch (0.1.0 → 0.1.1): Bug fix, config change, small tweak
# - minor (0.1.0 → 0.2.0): New feature, new route, new component
# - major (0.1.0 → 1.0.0): Breaking change, major refactor

# Bump version (example: minor bump)
npm version minor

# Commit version bump
git add package.json
git commit -m "chore(ui): bump version to 0.2.0"
```

**Why**: Prevents container image cache confusion. See `~/.claude/rules/container-versioning.md`.

---

### Step 4: Container Build (Multiarch Required)

**CRITICAL**: The cluster has both AMD64 and ARM64 nodes. Single-arch images will fail.

```bash
cd /home/pestilence/repos/personal/staple-ai/ui

# Get version and git SHA
export VERSION=$(grep -oP '(?<="version": ")[^"]*' package.json)
export GIT_SHA=$(git rev-parse --short HEAD)

# Build multiarch image
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t harbor.spooty.io/staple/ui:${VERSION} \
  -t harbor.spooty.io/staple/ui:${VERSION}-${GIT_SHA} \
  -t harbor.spooty.io/staple/ui:latest \
  --push \
  .

# Verify multiarch manifest
podman manifest inspect harbor.spooty.io/staple/ui:${VERSION} | \
  jq -r '.manifests[] | "\(.platform.os)/\(.platform.architecture)"'

# Expected output:
# linux/amd64
# linux/arm64
```

**Validation Checklist**:
- [ ] Build succeeded without errors
- [ ] Image pushed to Harbor
- [ ] Both amd64 and arm64 architectures present in manifest
- [ ] Version tag matches package.json

---

### Step 5: Deployment to Cluster

**Option A: Pulumi (Preferred)**

```bash
cd /home/pestilence/repos/personal/staple-ai/infra

# Preview changes
pulumi preview

# Review the diff carefully
# Ensure only expected resources are changing

# Deploy
pulumi up

# Confirm yes
```

**Option B: kubectl (Manual)**

```bash
# Update deployment to use new image
kubectl set image deployment/staple-ui \
  staple-ui=harbor.spooty.io/staple/ui:${VERSION} \
  -n staple

# Watch rollout
kubectl rollout status deployment/staple-ui -n staple

# Wait for: "deployment "staple-ui" successfully rolled out"
```

**Option C: GitHub Actions (CI/CD)**

```bash
# Push to feature branch
git push origin feature/your-branch

# GitHub Actions will automatically:
# 1. Build multiarch image
# 2. Push to Harbor
# 3. Deploy to staging (if configured)
# 4. Run smoke tests

# Check workflow status
gh run list --branch feature/your-branch
```

**Validation Checklist**:
- [ ] Deployment command succeeded
- [ ] Pods are running (next step verifies)
- [ ] No errors in deployment output

---

### Step 6: Kubernetes Validation

```bash
# Check deployment status
kubectl get deployment staple-ui -n staple

# Expected: READY 2/2 (or similar matching numbers)

# Check pods
kubectl get pods -n staple -l app=staple-ui

# Expected: All pods in Running state, READY 1/1

# Check endpoints
kubectl get endpoints staple-ui -n staple

# Expected: IP:port addresses listed (not empty)

# Check pod logs for errors
kubectl logs -n staple -l app=staple-ui --tail=100

# Expected: No ERROR, FATAL, PANIC lines
# Expected: "Server started" or similar success message

# Check events for issues
kubectl get events -n staple --sort-by='.lastTimestamp' | tail -20

# Expected: No errors, no ImagePullBackOff, no CrashLoopBackOff
```

**Validation Checklist**:
- [ ] Deployment shows READY X/X (matching numbers)
- [ ] All pods Running
- [ ] All pods READY 1/1 or 2/2
- [ ] Service endpoints populated
- [ ] Logs show healthy startup
- [ ] Zero errors in logs
- [ ] Zero errors in events

**Automated Validation Script**:

```bash
# Use the validation script
./scripts/validate-deployment.sh staple-ui staple https://staple.spooty.io

# Review output
# All checks should pass
```

---

### Step 7: Browser End-to-End Validation

**CRITICAL**: This is the MOST IMPORTANT step. Automated tests and kubectl checks do NOT prove the feature works for users.

```bash
# Get the ingress URL
kubectl get ingress staple -n staple

# Expected output shows URL (e.g., staple.spooty.io)
```

**Manual Testing (REQUIRED)**:

1. **Open browser** (Chrome/Firefox/Safari)
2. **Navigate to deployed application**: `https://staple.spooty.io`
3. **Test authentication**: Log in with your account
4. **Navigate to your new feature**: Click to development workspace (or changed page)
5. **Test all interactions**:
   - Click all buttons
   - Fill all forms
   - Test all view modes
   - Test theme switching
   - Test keyboard shortcuts
6. **Open browser console (F12)**:
   - Switch to Console tab
   - Verify ZERO errors
   - Verify ZERO warnings (or acceptable warnings only)
7. **Take screenshots**:
   - Main view of your feature
   - All interactive states
   - Console showing no errors
   - Any error states (if applicable)
8. **Test edge cases**:
   - Empty states
   - Error handling
   - Loading states
   - Large data sets (if applicable)

**Validation Checklist**:
- [ ] Page loads in <3 seconds
- [ ] Feature renders correctly (not blank, not error page)
- [ ] All UI interactions work as expected
- [ ] Zero JavaScript errors in console
- [ ] Zero network errors (check Network tab)
- [ ] Theme switching works (if applicable)
- [ ] Mobile responsive (if applicable)
- [ ] Screenshots captured

**Common Validation Failures**:

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Blank white screen | JavaScript error on mount | Check console, fix error, redeploy |
| 404 Not Found | Route not in container build | Rebuild container, redeploy |
| 502 Bad Gateway | Pod not ready/unhealthy | Check pod logs, fix startup issue |
| Components not rendering | Missing dependency in package.json | Add dependency, rebuild, redeploy |
| Slow page load | Large bundle size | Code split, lazy load components |
| Console errors | Runtime error in component | Fix error, redeploy |

---

### Step 8: Evidence Collection

**REQUIRED**: You must attach validation evidence to your PR.

```bash
# Collect Kubernetes evidence
kubectl get all -n staple -l app=staple-ui > /tmp/k8s-validation.txt
kubectl logs -n staple -l app=staple-ui --tail=100 > /tmp/pod-logs.txt

# Collect HTTP evidence
curl -sL https://staple.spooty.io | head -100 > /tmp/response-body.txt

# Check health endpoint (if exists)
curl -s https://staple.spooty.io/health | jq > /tmp/health-check.json

# Create validation report
cat > /tmp/validation-report.md << 'EOF'
## Verification Results

**Service**: Staple UI
**Version**: [VERSION from package.json]
**Endpoint**: https://staple.spooty.io
**Deployment Date**: [ISO 8601 timestamp]

### Kubernetes Resources

```
[paste kubectl get all output]
```

### Pod Logs

```
[paste kubectl logs output - confirm no errors]
```

### HTTP Response

```
[paste curl output - confirm app-specific content]
```

### Browser Console

Screenshot: `console-no-errors.png` - Attached

### Feature Screenshots

- Screenshot: `feature-main-view.png` - Attached
- Screenshot: `feature-interaction-test.png` - Attached

### Validation Result

✅ All validation checks passed
- Pods running
- Endpoints populated
- HTTP 200 OK with valid content
- Zero errors in logs
- Zero errors in browser console
- All user interactions tested
- Screenshots captured

Ready to merge.
EOF

echo "Validation report created: /tmp/validation-report.md"
echo "Attach this to your PR along with screenshots."
```

**Validation Checklist**:
- [ ] Validation report created
- [ ] kubectl output collected
- [ ] Pod logs collected (showing no errors)
- [ ] curl response collected
- [ ] Screenshots taken
- [ ] All evidence attached to PR

---

### Step 9: Create Pull Request

**ONLY after steps 1-8 are complete.**

```bash
# Ensure all changes committed
git add -A
git commit -m "feat(ui): add development workspace"

# Push feature branch
git push origin feature/development-workspace

# Create PR with evidence
gh pr create \
  --title "feat(ui): Add development workspace" \
  --body "$(cat /tmp/validation-report.md)"

# Upload screenshots
gh pr comment [PR-NUMBER] --body "Validation screenshots:" --attachment console-no-errors.png
gh pr comment [PR-NUMBER] --body "" --attachment feature-main-view.png
```

**PR Checklist (from template)**:
- [ ] Fill out all sections in PR template
- [ ] Check all applicable checkboxes
- [ ] Attach validation evidence
- [ ] Attach screenshots
- [ ] Request reviews

---

### Step 10: Merge (After Approval)

```bash
# Ensure all CI checks pass
gh pr checks [PR-NUMBER]

# Ensure all reviewers approved
gh pr status

# Merge with squash
gh pr merge [PR-NUMBER] --squash --delete-branch

# Verify merge succeeded
gh pr view [PR-NUMBER]

# Expected: Status: Merged
```

**Post-Merge Checklist**:
- [ ] PR merged to main
- [ ] Feature branch deleted
- [ ] CI/CD deployed to production (if configured)
- [ ] Production validation complete (same as step 7, but on production URL)

---

## Common Mistakes to Avoid

### Mistake 1: "Tests pass" = "Done"

**Wrong**: Create PR immediately after tests pass.

**Right**: Tests pass → build container → deploy → validate in browser → THEN create PR.

### Mistake 2: Skipping Browser Testing

**Wrong**: Check `kubectl get pods`, see Running, declare success.

**Right**: Even if pods are Running, you MUST test in a real browser. Pods can be running but serving error pages.

### Mistake 3: Single-Arch Container Builds

**Wrong**: `docker build` without `--platform` flag.

**Right**: Always `docker buildx build --platform linux/amd64,linux/arm64`.

**Why**: Cluster has ARM nodes. Single-arch images fail with "exec format error."

### Mistake 4: Forgetting Version Bump

**Wrong**: Build new image with same version tag.

**Right**: Always bump version in package.json before building.

**Why**: Same tag = Kubernetes may pull cached corrupted layer instead of fresh image.

### Mistake 5: Trusting HTTP Status Codes Alone

**Wrong**: `curl` returns 200, declare success.

**Right**: Fetch response body, verify it contains app-specific content (not error page).

**Why**: 200 OK can return blank page, default server page, or framework error page.

### Mistake 6: Not Collecting Evidence

**Wrong**: Test in browser, see it works, create PR without screenshots.

**Right**: Always capture screenshots and logs. Attach to PR.

**Why**: Reviewers need proof. Future you needs proof when debugging.

### Mistake 7: Deploying Without Validation Plan

**Wrong**: Run `pulumi up`, hope for the best.

**Right**: Read the validation protocol first. Know what you'll check before deploying.

**Why**: You need to know what success looks like before you deploy.

---

## Workflow Violations

The following are VIOLATIONS of the deployment workflow and are NOT ACCEPTABLE:

- Creating PR before deployment
- Creating PR without browser testing
- Merging PR without validation evidence
- Using single-arch container images
- Not bumping version for functional changes
- Claiming "done" when only tests pass
- Skipping manual browser testing
- Not collecting validation evidence
- Not attaching screenshots to PR

**Consequence**: PR will be rejected and must be reworked.

---

## When Can You Skip Steps?

**Documentation-only changes**:
- Skip: Container build, deployment, browser testing
- Required: Code review, merge

**Config-only changes (no code)**:
- Skip: Container build (maybe - depends on config location)
- Required: Deployment, validation

**Backend API changes (no UI)**:
- Skip: Browser UI testing
- Required: API testing with curl/Postman, validate response schemas

**Test-only changes**:
- Skip: Deployment (tests run in CI)
- Required: All tests pass

**Infrastructure changes (Pulumi)**:
- Skip: Container build
- Required: Pulumi preview, Pulumi up, resource validation

**When in doubt**: Follow the full workflow.

---

## Deployment Environments

| Environment | Purpose | Deployment Method | Validation Level |
|-------------|---------|-------------------|------------------|
| Local Dev | Development | `pnpm dev` | Manual browser testing |
| Staging | Pre-production testing | CI/CD or manual | Full validation protocol |
| Production | Live users | CI/CD with approval | Full validation protocol + monitoring |

**Note**: Staging environment may not exist yet. If not, deploy to a test namespace in production cluster (e.g., `staple-test`).

---

## Rollback Procedure

If validation fails after deployment:

```bash
# Get previous working image
kubectl rollout history deployment/staple-ui -n staple

# Rollback to previous revision
kubectl rollout undo deployment/staple-ui -n staple

# Verify rollback
kubectl rollout status deployment/staple-ui -n staple

# Validate
./scripts/validate-deployment.sh staple-ui staple https://staple.spooty.io

# Check in browser
# Verify old version is working
```

**Post-Rollback**:
1. Investigate why deployment failed
2. Fix issue locally
3. Test fix locally
4. Redeploy with fix
5. Revalidate

---

## Troubleshooting

### Pods Not Starting

```bash
# Check pod events
kubectl describe pod [POD-NAME] -n staple

# Common causes:
# - ImagePullBackOff: Image doesn't exist in Harbor or wrong tag
# - CrashLoopBackOff: Container starts then crashes (check logs)
# - Pending: Not enough resources (check node capacity)

# Fix and redeploy
```

### Endpoints Empty

```bash
# Check service selector
kubectl get service staple-ui -n staple -o yaml | grep selector

# Check pod labels
kubectl get pods -n staple --show-labels | grep staple-ui

# Ensure labels match
# Fix and redeploy if mismatch
```

### 502 Bad Gateway

```bash
# Check if pod is ready
kubectl get pods -n staple -l app=staple-ui

# If not ready, check readiness probe
kubectl describe pod [POD-NAME] -n staple | grep -A 5 Readiness

# Check pod logs for startup errors
kubectl logs -n staple [POD-NAME]

# Common causes:
# - App not listening on correct port
# - Readiness probe misconfigured
# - App crashing on startup
```

### Blank White Screen in Browser

```bash
# Check browser console (F12)
# Common causes:
# - JavaScript syntax error
# - Failed to load bundle
# - React hydration error
# - Missing environment variable

# Check Network tab for failed requests
# Fix error and redeploy
```

---

## Best Practices

1. **Test locally first**: Always test in dev server before building container.
2. **Version everything**: Bump version for every functional change.
3. **Multiarch always**: Never build single-arch images.
4. **Validate thoroughly**: Browser testing is mandatory.
5. **Collect evidence**: Screenshots and logs prove validation occurred.
6. **Rollback plan**: Know how to rollback before deploying.
7. **Monitor after deploy**: Watch metrics for anomalies.
8. **Document issues**: If validation fails, document why and how you fixed it.

---

## Additional Resources

- Validation Protocol: `~/.claude/rules/validation.md`
- Container Versioning: `~/.claude/rules/container-versioning.md`
- Infrastructure Standards: `~/.claude/rules/infrastructure.md`
- Workflow Gates: `~/.claude/rules/workflow.md`
- CI/CD Requirements: `~/.claude/rules/cicd.md`

---

## Questions?

If you're unsure about any step in this workflow, ASK before proceeding. Better to clarify than to deploy broken code.

**Remember**: "Tests pass" is NOT "deployment complete." The feature is complete when it works for users in production.
