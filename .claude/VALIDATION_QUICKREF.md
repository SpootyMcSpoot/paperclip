# Staple Development Workspace Validation - Quick Reference

## One-Line Commands

```bash
# Basic validation (no browser)
./.claude/validate-development-workspace.sh

# Verbose output
./.claude/validate-development-workspace.sh --verbose

# Custom namespace/URL
./.claude/validate-development-workspace.sh --namespace custom --url https://example.com

# Browser tests only (requires Playwright installed)
cd .claude && STAPLE_URL=https://staple.spooty.io npx playwright test playwright-development-workspace.spec.js

# Full validation pipeline (recommended)
./.claude/validate-development-workspace.sh --verbose && echo "✓ Shell validation passed, running browser tests..." && cd .claude && npx playwright test playwright-development-workspace.spec.js --reporter=line
```

## 10 Validation Checks

| # | Check | What It Does |
|---|-------|--------------|
| 1 | Namespace | Verifies `staple` namespace exists |
| 2 | Deployment | Checks replicas ready (e.g., 2/2) |
| 3 | Pods | All pods Running with ready containers |
| 4 | Logs | Scans for errors in recent pod logs |
| 5 | Service | Confirms service has active endpoints |
| 6 | Ingress | Validates IngressRoute/Ingress exists |
| 7 | Health | Tests `/api/health` returns 200 |
| 8 | Monaco | Verifies Monaco Editor assets in container |
| 9 | Dev Route | Tests `/{company}/development` returns 200 |
| 10 | Browser | Playwright E2E tests (if installed) |

## Pass/Fail Indicators

```
✓ Check passed (green)
✗ Check failed (red)
[INFO] Information (green)
[WARN] Warning (yellow)
[ERROR] Error (red)
```

## Exit Codes

- `0` = All checks passed
- `1` = One or more checks failed

## Quick Troubleshooting

| Failure | Quick Fix |
|---------|-----------|
| Pods not ready | `kubectl get pods -n staple` then check logs |
| Health endpoint fails | `kubectl logs -n staple -l app=staple` |
| Monaco not found | Check build includes Monaco: `kubectl exec <pod> -- ls /app/dist/static/js \| grep monaco` |
| Route 404 | Verify React Router config and rebuild |
| Playwright timeout | Increase `TIMEOUT` in spec file or check network |

## Playwright Setup (One-Time)

```bash
cd /home/pestilence/repos/personal/staple-ai/.claude
npm init -y
npm install -D @playwright/test
npx playwright install chromium
```

## Files Created

- `/home/pestilence/repos/personal/staple-ai/.claude/validate-development-workspace.sh` (484 lines, executable)
- `/home/pestilence/repos/personal/staple-ai/.claude/playwright-development-workspace.spec.js` (313 lines)
- `/home/pestilence/repos/personal/staple-ai/.claude/VALIDATION_GUIDE.md` (313 lines, detailed guide)
- `/home/pestilence/repos/personal/staple-ai/.claude/VALIDATION_QUICKREF.md` (this file)

## Environment Variables

```bash
STAPLE_NAMESPACE=staple    # Default namespace
STAPLE_URL=https://staple.spooty.io  # Default URL
TEST_COMPANY=test-company        # Company slug for Playwright tests
VERBOSE=false                    # Set to true for debug output
```

## CI/CD Integration Snippet

```yaml
- name: Validate Deployment
  run: ./.claude/validate-development-workspace.sh --verbose
```

## Following validation.md Protocol

This validation suite adheres to strict requirements:

1. Checks response body content, not just HTTP status
2. Verifies user-facing functionality in browser
3. Validates actual Kubernetes resource state
4. Captures evidence (screenshots, logs, output)
5. Never claims "complete" without end-to-end validation
6. Fails fast with actionable error messages

## Screenshot Output (Playwright)

Saved to `.claude/screenshots/`:

- `development-workspace-initial.png`
- `development-workspace-monaco-loaded.png`
- `development-workspace-monaco-interaction.png`
- `development-workspace-monaco-timeout.png` (on error)
- `development-workspace-with-errors.png` (on error)

## Complete Workflow Example

```bash
# After deploying via Pulumi
cd /home/pestilence/repos/personal/staple-ai

# Run full validation
./.claude/validate-development-workspace.sh --verbose

# If all checks pass (exit 0)
echo "Deployment validated successfully"

# If checks fail (exit 1)
echo "Validation failed, check output above"
kubectl logs -n staple -l app=staple --tail=50

# Run browser tests separately if needed
cd .claude
npx playwright test playwright-development-workspace.spec.js --headed
```
