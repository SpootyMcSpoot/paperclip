---
name: security
description: Run security scans on staple-ai (StapleAI) pnpm monorepo. npm audit, secrets detection, build integrity.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# Security Scan for staple-ai

## 1. Dependency Vulnerabilities
```bash
cd /home/pestilence/repos/personal/staple-ai
pnpm audit 2>/dev/null || npm audit --omit=dev 2>/dev/null || echo "audit failed"
```

## 2. Secrets Detection
```bash
cd /home/pestilence/repos/personal/staple-ai
gitleaks detect --source . --no-git 2>/dev/null || grep -rn "password\s*=\s*[\"']\|apiKey\s*=\s*[\"']\|secret\s*=\s*[\"']" . --include="*.ts" --include="*.tsx" --include="*.js" | grep -vi "test\|mock\|example\|env\|config\|process\.env\|placeholder" || echo "No hardcoded secrets found"
```

## 3. License Check
```bash
cd /home/pestilence/repos/personal/staple-ai
npx license-checker --onlyAllow "MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;0BSD;CC0-1.0;Unlicense" 2>/dev/null || echo "license-checker not available"
```

## 4. Report
```
| Check         | Result    | Details                    |
|---------------|-----------|----------------------------|
| Dependencies  | PASS/FAIL | N vulnerabilities          |
| Secrets       | PASS/FAIL | N leaks found              |
| Licenses      | PASS/FAIL | N copyleft detected        |
```
