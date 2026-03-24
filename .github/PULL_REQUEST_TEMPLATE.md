# Pull Request

## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Configuration change
- [ ] Refactoring (no functional changes)

## Related Issues

<!-- Link to related issues using #issue-number -->

Closes #

---

## Pre-Merge Checklist

### Code Quality

- [ ] TypeScript/JavaScript compiles with zero errors
- [ ] All tests pass (unit + integration)
  - [ ] Unit tests: `pnpm test`
  - [ ] Integration tests: `pnpm test:integration` (if applicable)
- [ ] Linter passes with zero warnings: `pnpm lint`
- [ ] Code formatted: `pnpm format`
- [ ] No commented-out code (delete, don't comment)
- [ ] No new console.log statements (use proper logging)
- [ ] Type safety: No `any` types without justification

### Container Build (Required for UI/Backend Changes)

- [ ] Version bumped in `package.json` (follow semver: major.minor.patch)
  - Current version: `____`
  - New version: `____`
  - Bump reason: [bug fix/feature/breaking change]
- [ ] Multiarch container built: `linux/amd64,linux/arm64`
- [ ] Image pushed to Harbor: `harbor.spooty.io/staple/[service]:[version]`
- [ ] Image tagged with version and git SHA
- [ ] Multiarch manifest verified:
  ```bash
  podman manifest inspect harbor.spooty.io/staple/[service]:[version] | \
    jq -r '.manifests[] | "\(.platform.os)/\(.platform.architecture)"'
  ```
  Expected output: `linux/amd64` and `linux/arm64`

**Note**: If this is a documentation-only or config-only change that doesn't affect container contents, check here and skip container build steps:
- [ ] No container rebuild required (documentation/config only)

### Local Testing (Required Before Deployment)

- [ ] Dev server tested locally: `pnpm --filter @stapleai/[service] dev`
- [ ] All UI interactions manually tested in browser
- [ ] Browser console shows zero errors (F12 Developer Tools)
- [ ] Mobile responsive design tested (if UI change)
- [ ] Theme switching tested (if UI change)
- [ ] Screenshots captured of changes

### Deployment (Required Before Merge)

**CRITICAL**: Do NOT merge this PR until deployed and validated in a test environment.

- [ ] Deployment method chosen:
  - [ ] Pulumi: `cd infra && pulumi preview && pulumi up`
  - [ ] kubectl: `kubectl apply -f k8s/[manifest].yaml`
  - [ ] GitHub Actions: CI/CD pipeline triggered
- [ ] Kubernetes resources validated:
  ```bash
  kubectl get deployment [name] -n [namespace]
  kubectl get pods -n [namespace] -l app=[name]
  kubectl get endpoints [name] -n [namespace]
  ```
- [ ] Pods are Running with READY state (e.g., 1/1, 2/2)
- [ ] Service endpoints populated (not empty)
- [ ] Pod logs show no errors:
  ```bash
  kubectl logs -n [namespace] -l app=[name] --tail=100
  ```

### Browser End-to-End Validation (Required)

**CRITICAL**: Automated tests are NOT sufficient. Manual browser testing is REQUIRED.

- [ ] Deployed application accessed in browser
  - URL tested: `____________________________________`
  - Browser: [ ] Chrome [ ] Firefox [ ] Safari
- [ ] Full user workflow tested end-to-end:
  - [ ] Navigation to new/changed pages works
  - [ ] All buttons/links function correctly
  - [ ] Forms submit successfully
  - [ ] Data loads and displays correctly
  - [ ] Error states handled gracefully
- [ ] Browser console (F12) shows zero JavaScript errors
- [ ] Page loads in <3 seconds
- [ ] No layout breaking/visual bugs
- [ ] Screenshots captured:
  - [ ] Main view
  - [ ] All interactive states
  - [ ] Error states (if applicable)

### Validation Evidence (Required - Attach to PR)

**CRITICAL**: This PR cannot be merged without validation evidence.

- [ ] Kubernetes validation output attached:
  ```bash
  kubectl get all -n [namespace] -l app=[name]
  ```
- [ ] Pod logs showing healthy startup attached (no errors)
- [ ] Screenshots of deployed application attached
- [ ] Browser console screenshot showing no errors attached
- [ ] Health check response attached (if applicable):
  ```bash
  curl -s https://[url]/health | jq
  ```
- [ ] Response body verification attached:
  ```bash
  curl -sL https://[url] | head -100
  ```

**Evidence Attachment**: Paste validation output below or attach as PR comment.

<details>
<summary>Validation Evidence</summary>

```bash
# Paste kubectl output, logs, curl responses here


```

Screenshots:
- [ ] Attached: `screenshot-main-view.png`
- [ ] Attached: `screenshot-console-no-errors.png`
- [ ] Attached: `screenshot-interaction-test.png`

</details>

### Documentation

- [ ] README.md updated (if applicable)
- [ ] User-facing documentation updated (if applicable)
- [ ] API documentation updated (if backend change)
- [ ] CHANGELOG.md updated
- [ ] Code comments added for complex logic
- [ ] Type definitions documented

### Security

- [ ] No secrets committed (.env, API keys, tokens, passwords)
- [ ] No sensitive data in logs
- [ ] Input validation added (if handling user input)
- [ ] Authentication/authorization checks in place (if applicable)
- [ ] Dependencies scanned for vulnerabilities: `pnpm audit`

### Performance

- [ ] No performance regressions introduced
- [ ] Large files (>5000 lines) load without lag (if applicable)
- [ ] Memory usage acceptable (checked in DevTools)
- [ ] No unnecessary re-renders (if React component)

---

## Deployment Notes

<!-- Any special deployment considerations, rollback plans, or post-deployment steps -->

**Deployment Command Used**:
```bash
# Paste the exact deployment command used


```

**Rollback Command** (if deployment fails):
```bash
# Paste the rollback command to revert this change


```

---

## Testing Strategy

<!-- Describe how you tested this change -->

### Unit Tests

<!-- List new/updated unit tests -->

- [ ] Test 1: `____`
- [ ] Test 2: `____`

### Integration Tests

<!-- List integration test scenarios -->

- [ ] Scenario 1: `____`
- [ ] Scenario 2: `____`

### Manual Testing

<!-- Describe manual testing performed -->

1.
2.
3.

---

## Breaking Changes

<!-- If this PR introduces breaking changes, describe them and provide migration steps -->

- [ ] No breaking changes

**OR**

Breaking changes introduced:
- Change 1: `____`
  - Migration: `____`

---

## Post-Merge Actions

<!-- Any actions required after merging, such as database migrations, config updates, etc. -->

- [ ] None required

**OR**

Required actions:
- [ ] Action 1: `____`
- [ ] Action 2: `____`

---

## Reviewer Checklist

**For Reviewers**: Do NOT approve this PR unless ALL of the following are true:

- [ ] Code changes reviewed and approved
- [ ] Tests pass in CI/CD
- [ ] Container build section completed (or marked N/A with justification)
- [ ] Deployment section completed with all checkboxes marked
- [ ] Browser validation section completed with evidence
- [ ] Screenshots attached showing deployed application
- [ ] Validation evidence attached (kubectl output, logs, curl responses)
- [ ] No errors in browser console (screenshot attached)
- [ ] Documentation updated
- [ ] No security concerns

**Approval Policy**:
- UI/UX changes: Require design review
- Backend API changes: Require API review
- Security-sensitive changes: Require security review
- Infrastructure changes: Require DevOps review

---

## AI Assistant Note

**If this PR was created with AI assistance (Claude, GitHub Copilot, etc.):**

NEVER mention AI assistance in:
- Commit messages
- Code comments
- Documentation
- PR description
- Any project files

Commits must use default git settings. No AI attribution.

---

## Compliance

By submitting this PR, I confirm:

- [ ] I have tested this change locally in dev server
- [ ] I have deployed this change to a test environment
- [ ] I have validated the deployment in a real browser
- [ ] I have attached validation evidence
- [ ] I have followed the container versioning policy (semver bump)
- [ ] I have built multiarch images (amd64 + arm64)
- [ ] I understand this PR will be rejected if not deployed and validated

**Completion Criteria**: This PR is complete when code works, tests pass, container builds, deployment succeeds, browser validation passes, and evidence is attached. "Tests pass" alone is NOT sufficient.

---

## Additional Notes

<!-- Any other information that would be helpful for reviewers -->
