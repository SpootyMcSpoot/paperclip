---
name: precommit
description: Fast pre-commit validation for staple-ai. Type-checks changed TypeScript files.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# Pre-commit Check for staple-ai

## 1. Changed Files
```bash
cd /home/pestilence/repos/personal/staple-ai
TS=$(git diff --name-only --cached --diff-filter=ACM -- '*.ts' '*.tsx' 2>/dev/null || git diff --name-only HEAD -- '*.ts' '*.tsx')
[ -z "$TS" ] && echo "No TypeScript files changed" && exit 0
```

## 2. Type Check
```bash
cd /home/pestilence/repos/personal/staple-ai
pnpm typecheck
```

## 3. Lint (if configured)
```bash
cd /home/pestilence/repos/personal/staple-ai
pnpm lint 2>/dev/null || true
```
