---
name: qa
description: Run QA checks on staple-ai (StapleAI) monorepo. Type-checks, lints, runs vitest unit tests, and reports coverage across all packages.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# QA Validation for staple-ai

Run the full QA suite for the pnpm monorepo. Execute each section in order. Stop on first failure and report.

## 1. Type Checking

```bash
cd /home/pestilence/repos/personal/staple-ai
pnpm typecheck
```

## 2. Lint

Check for ESLint config. If present:

```bash
cd /home/pestilence/repos/personal/staple-ai
pnpm lint 2>/dev/null || npx eslint . --ext .ts,.tsx --max-warnings=0
```

If no lint script exists, run tsc strict checks:

```bash
npx tsc --noEmit --strict
```

## 3. Unit Tests

```bash
cd /home/pestilence/repos/personal/staple-ai
pnpm test:run
```

Or directly:

```bash
npx vitest run --reporter=verbose
```

## 4. Test Coverage

```bash
cd /home/pestilence/repos/personal/staple-ai
npx vitest run --coverage --reporter=verbose
```

Check if coverage thresholds are defined in `vitest.config.ts`. If not, report raw numbers.

## 5. Build Verification

```bash
cd /home/pestilence/repos/personal/staple-ai
pnpm build
```

Build must succeed with zero errors. TypeScript compilation errors here indicate type issues missed by `typecheck`.

## 6. Report

Output a summary table:

```
| Check      | Result    | Details                          |
|------------|-----------|----------------------------------|
| Types      | PASS/FAIL | N errors                         |
| Lint       | PASS/FAIL | N warnings, N errors             |
| Tests      | PASS/FAIL | N passed, N failed, coverage %   |
| Build      | PASS/FAIL | Build output size, errors        |
```

Include file:line for every failure. Flag any `continue-on-error` patterns in CI that mask real failures.
