# Staple Development Workspace Validation Guide

This directory contains comprehensive validation tooling for the Staple Development workspace feature deployment.

## Overview

The validation suite consists of two complementary tools:

1. **validate-development-workspace.sh** - Shell script for infrastructure and API validation
2. **playwright-development-workspace.spec.js** - Browser-based E2E tests for UI validation

## Quick Start

### Basic Validation (No Browser)

```bash
cd /home/pestilence/repos/personal/staple-ai
./.claude/validate-development-workspace.sh
```

### Full Validation (With Browser Tests)

```bash
# Install Playwright (one-time setup)
cd /home/pestilence/repos/personal/staple-ai/.claude
npm init -y
npm install -D @playwright/test
npx playwright install chromium

# Run full validation
cd /home/pestilence/repos/personal/staple-ai
./.claude/validate-development-workspace.sh --verbose
```

## Validation Script Details

### What It Checks

1. **Namespace Validation** - Verifies staple namespace exists
2. **Deployment Status** - Checks deployment ready replicas match desired
3. **Pod Health** - Validates all pods are Running with ready containers
4. **Pod Logs** - Scans for errors in recent logs
5. **Service Endpoints** - Confirms service has active endpoints
6. **Ingress Configuration** - Validates IngressRoute or Ingress resources
7. **Health Endpoint** - Tests `/api/health` returns HTTP 200
8. **Monaco Assets** - Verifies Monaco Editor files exist in container
9. **Development Route** - Tests `/{company}/development` route accessibility
10. **Browser Tests** - Runs Playwright E2E tests (if available)

### Command Line Options

```bash
# Use custom namespace
./.claude/validate-development-workspace.sh --namespace my-namespace

# Use custom URL
./.claude/validate-development-workspace.sh --url https://custom.domain.com

# Verbose output with detailed logs
./.claude/validate-development-workspace.sh --verbose

# Environment variable overrides
STAPLE_NAMESPACE=custom-ns STAPLE_URL=https://example.com ./validate-development-workspace.sh
```

### Exit Codes

- `0` - All validations passed
- `1` - One or more validations failed

### Example Output

```
========================================
1. Namespace Validation
========================================
✓ Namespace 'staple' exists

========================================
2. Deployment Validation
========================================
✓ Deployment ready: 2/2 replicas

========================================
Validation Summary
========================================
Passed: 10
Failed: 0

[INFO] All validations passed!
```

## Playwright Tests Details

### What It Tests

1. **Page Load** - Navigates to development workspace and verifies load
2. **Monaco Editor Load** - Waits for Monaco Editor to appear in DOM
3. **Monaco Interaction** - Tests typing in the editor
4. **Console Errors** - Captures and reports JavaScript errors
5. **Navigation** - Verifies routing works correctly
6. **Asset Loading** - Checks all critical assets load successfully

### Running Tests Standalone

```bash
cd /home/pestilence/repos/personal/staple-ai/.claude

# Run all tests
STAPLE_URL=https://staple.spooty.io npx playwright test playwright-development-workspace.spec.js

# Run specific test
npx playwright test playwright-development-workspace.spec.js -g "should load Monaco Editor"

# Run with UI mode (interactive)
npx playwright test playwright-development-workspace.spec.js --ui

# Run in headed mode (see browser)
npx playwright test playwright-development-workspace.spec.js --headed

# Generate HTML report
npx playwright test playwright-development-workspace.spec.js --reporter=html
```

### Screenshots

Tests automatically capture screenshots in `.claude/screenshots/`:

- `development-workspace-initial.png` - Initial page load
- `development-workspace-monaco-loaded.png` - After Monaco loads
- `development-workspace-monaco-interaction.png` - After typing in editor
- `development-workspace-monaco-timeout.png` - If Monaco fails to load (error case)
- `development-workspace-with-errors.png` - If console errors detected (error case)

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Validate Staple Development Workspace
  run: |
    ./.claude/validate-development-workspace.sh --verbose
  env:
    STAPLE_NAMESPACE: staple
    STAPLE_URL: https://staple.spooty.io

- name: Run Playwright E2E Tests
  run: |
    cd .claude
    npm ci
    npx playwright install chromium
    STAPLE_URL=https://staple.spooty.io npx playwright test playwright-development-workspace.spec.js
  if: success()

- name: Upload Playwright Report
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: .claude/playwright-report/
    retention-days: 30
```

## Troubleshooting

### Monaco Assets Not Found

If validation fails to find Monaco assets:

```bash
# Check container filesystem
POD=$(kubectl get pods -n staple -l app=staple -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n staple $POD -- find /app -name '*monaco*' -type d

# Check build output
kubectl exec -n staple $POD -- ls -la /app/dist/static/js/
```

### Health Endpoint Fails

If `/api/health` returns non-200:

```bash
# Check pod logs
kubectl logs -n staple -l app=staple --tail=50

# Check service endpoints
kubectl get endpoints -n staple staple

# Test directly from pod
kubectl exec -n staple $POD -- curl localhost:3000/api/health
```

### Development Route Returns 404

If `/{company}/development` route fails:

```bash
# Verify React Router configuration
kubectl exec -n staple $POD -- cat /app/dist/index.html

# Check if build includes development route
kubectl logs -n staple -l app=staple | grep -i "development\|route"
```

### Playwright Tests Fail

Common issues:

1. **Browser not installed**: Run `npx playwright install chromium`
2. **Network timeout**: Increase `TIMEOUT` constant in spec file
3. **Monaco not loading**: Check browser console in headed mode
4. **Self-signed cert**: Test script already ignores HTTPS errors

Debug with headed mode:

```bash
npx playwright test playwright-development-workspace.spec.js --headed --debug
```

## Following validation.md Protocol

This validation suite follows the strict requirements from `validation.md`:

- Checks HTTP status codes AND response body content
- Verifies actual user-facing functionality (browser tests)
- Validates Kubernetes resource state (pods, services, endpoints)
- Captures evidence (screenshots, logs, curl output)
- Reports clear pass/fail with actionable error messages
- Does not claim "complete" without end-to-end validation

## Integration with Deployment Workflow

Recommended workflow:

```bash
# 1. Make changes to Staple code
git checkout -b feature/development-workspace

# 2. Build and push image (via CI/CD)
# ... GitHub Actions builds multiarch image ...

# 3. Deploy via Pulumi
cd pulumi/stacks/06-staple
pulumi up

# 4. Run validation suite
cd /home/pestilence/repos/personal/staple-ai
./.claude/validate-development-workspace.sh --verbose

# 5. If validation passes, create PR
git push origin feature/development-workspace
gh pr create --title "Add development workspace" --body "..."

# 6. After PR merged, validate production
./.claude/validate-development-workspace.sh --url https://staple.spooty.io
```

## Maintenance

### Updating Test Company

To test with different company slug:

```bash
TEST_COMPANY=my-company npx playwright test playwright-development-workspace.spec.js
```

### Adding New Validation Checks

To add custom checks to the shell script:

```bash
validate_custom_feature() {
    section "N. Custom Feature Validation"

    # Your validation logic here

    if [[ $check_passed ]]; then
        pass "Custom check passed"
        return 0
    else
        fail "Custom check failed"
        return 1
    fi
}

# Then add to main() function:
validate_custom_feature || true
```

### Extending Playwright Tests

Add new test cases to the spec file:

```javascript
test('should validate custom feature', async ({ page }) => {
    await page.goto(`${BASE_URL}/${TEST_COMPANY}/development`);

    // Your test logic here
    const element = await page.locator('#custom-feature');
    await expect(element).toBeVisible();
});
```

## Support

For issues or questions:

1. Check troubleshooting section above
2. Review validation.md protocol requirements
3. Check Staple pod logs: `kubectl logs -n staple -l app=staple`
4. Review Playwright trace: `npx playwright show-trace trace.zip`
