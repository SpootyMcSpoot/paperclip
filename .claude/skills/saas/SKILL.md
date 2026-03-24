---
name: saas
description: SaaS platform validation for staple-ai. Checks multi-tenancy isolation, subscription lifecycle, billing/budget enforcement, permission grant correctness, and cost tracking integrity.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# SaaS Platform Validation for staple-ai

## 1. Multi-Tenancy Isolation

Verify company-based tenancy is enforced at every data access layer.

```bash
cd /home/pestilence/repos/personal/staple-ai

# Check company-scoped indexes (should be present on all tenant tables)
echo "=== Company-Scoped Indexes ==="
grep -rn "company_id\|companyId\|company.*index\|tenant.*id" prisma/schema.prisma | head -30

# Verify all queries filter by company
echo "=== Query Scoping ==="
grep -rn "where.*company\|findMany.*company\|company_id\|companyId" src/ --include="*.ts" | head -30

# Check for cross-tenant data access vulnerabilities
echo "=== Cross-Tenant Risk ==="
grep -rn "findMany\|findFirst\|findUnique" src/ --include="*.ts" | grep -v "company\|where" | head -20

# Verify middleware/guard enforces tenant context
echo "=== Tenant Guard ==="
grep -rn "tenant\|company.*guard\|company.*middleware\|getCompany\|currentCompany" src/ --include="*.ts" | head -20
```

## 2. Subscription State Machine

Verify subscription status transitions are valid and no illegal states are possible.

```bash
cd /home/pestilence/repos/personal/staple-ai

# Check subscription status enum
echo "=== Subscription States ==="
grep -rn "SubscriptionStatus\|active\|canceled\|past_due\|trialing\|paused\|churned" prisma/schema.prisma src/ --include="*.ts" | head -20

# Verify state transition validation
echo "=== State Transitions ==="
grep -rn "transition\|canTransition\|fromStatus\|toStatus\|status.*update" src/ --include="*.ts" | head -20

# Check Stripe webhook handling for subscription events
echo "=== Stripe Webhooks ==="
grep -rn "customer.subscription\|invoice.paid\|invoice.payment_failed\|checkout.session" src/ --include="*.ts" | head -20

# Verify customer lifecycle (trial -> active -> paused -> churned)
echo "=== Customer Lifecycle ==="
grep -rn "trial\|activate\|pause\|churn\|cancel\|reactivate" src/ --include="*.ts" | head -20
```

## 3. Billing & Budget Enforcement

Verify budget policies enforce hard stops and cost tracking is accurate.

```bash
cd /home/pestilence/repos/personal/staple-ai

# Check budget policy definition
echo "=== Budget Policies ==="
grep -rn "budget\|hardStop\|softLimit\|spending.*limit\|cost.*cap" src/ --include="*.ts" | head -20

# Verify cost events track per-LLM-call spending
echo "=== Cost Events ==="
grep -rn "cost_event\|costEvent\|tokenCost\|usage.*cost\|track.*cost" src/ --include="*.ts" | head -20

# Check finance events for billing aggregation
echo "=== Finance Events ==="
grep -rn "finance_event\|financeEvent\|billing.*event\|aggregate.*cost\|invoice.*line" src/ --include="*.ts" | head -20

# Verify hard stop enforcement blocks requests when exceeded
echo "=== Hard Stop ==="
grep -rn "hardStop\|exceed.*budget\|over.*limit\|block.*request\|budget.*enforce" src/ --include="*.ts" | head -20
```

## 4. Permission Grant Correctness

Verify polymorphic permission grants resolve correctly for users, teams, and roles.

```bash
cd /home/pestilence/repos/personal/staple-ai

# Check permission grant structure
echo "=== Permission Grants ==="
grep -rn "principalType\|principalId\|permission.*grant\|PermissionGrant\|Grant" prisma/schema.prisma src/ --include="*.ts" | head -20

# Verify grant resolution order (user > team > role)
echo "=== Grant Resolution ==="
grep -rn "resolve.*permission\|check.*permission\|hasPermission\|authorize\|can(" src/ --include="*.ts" | head -20

# Check for permission bypass risks
echo "=== Permission Bypass ==="
grep -rn "skipAuth\|noAuth\|public.*route\|isAdmin\|superuser" src/ --include="*.ts" | head -20
```

## 5. Stripe Integration Safety

Verify Stripe API usage follows best practices for idempotency and error handling.

```bash
cd /home/pestilence/repos/personal/staple-ai

# Check idempotency keys on Stripe calls
echo "=== Idempotency ==="
grep -rn "idempotencyKey\|idempotency_key\|Idempotency-Key" src/ --include="*.ts" | head -10

# Verify webhook signature verification
echo "=== Webhook Verification ==="
grep -rn "constructEvent\|stripe.*signature\|webhook.*secret\|endpointSecret" src/ --include="*.ts" | head -10

# Check error handling on payment failures
echo "=== Payment Error Handling ==="
grep -rn "StripeError\|card_declined\|payment.*fail\|charge.*fail\|catch.*stripe" src/ --include="*.ts" | head -15

# Verify test mode detection
echo "=== Test Mode ==="
grep -rn "test_\|sk_test\|pk_test\|STRIPE_.*KEY" src/ --include="*.ts" | grep -vi "mock\|example" | head -10
```

## 6. Report

```
| Check                  | Result    | Details                                |
|------------------------|-----------|----------------------------------------|
| Multi-Tenancy          | PASS/FAIL | Company scoping on all queries?        |
| Subscription States    | PASS/FAIL | Valid transitions? Webhook handled?    |
| Billing/Budget         | PASS/FAIL | Hard stops enforced? Costs tracked?    |
| Permissions            | PASS/FAIL | Polymorphic grants resolve correctly?  |
| Stripe Safety          | PASS/FAIL | Idempotency? Signatures? Error paths?  |
```
