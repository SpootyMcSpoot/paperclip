#!/bin/bash
#
# validate-deployment.sh
#
# Validates that a Kubernetes deployment meets all requirements from the
# deployment validation protocol.
#
# Usage:
#   ./scripts/validate-deployment.sh <service-name> <namespace> <url>
#
# Example:
#   ./scripts/validate-deployment.sh staple-ui staple https://staple.spooty.io
#
# Exit codes:
#   0 - All validation checks passed
#   1 - One or more validation checks failed
#

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validation results
PASSED=0
FAILED=0
WARNINGS=0

# Parse arguments
if [ $# -lt 3 ]; then
  echo "Usage: $0 <service-name> <namespace> <url>"
  echo ""
  echo "Example: $0 staple-ui staple https://staple.spooty.io"
  exit 1
fi

SERVICE_NAME="$1"
NAMESPACE="$2"
URL="$3"

echo "============================================"
echo "Deployment Validation Report"
echo "============================================"
echo "Service: $SERVICE_NAME"
echo "Namespace: $NAMESPACE"
echo "URL: $URL"
echo "Timestamp: $(date -Iseconds)"
echo "============================================"
echo ""

# Helper functions
pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASSED++))
}

fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAILED++))
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((WARNINGS++))
}

section() {
  echo ""
  echo "---[ $1 ]---"
  echo ""
}

# 1. Check Kubernetes Deployment
section "Kubernetes Deployment"

if kubectl get deployment "$SERVICE_NAME" -n "$NAMESPACE" &>/dev/null; then
  pass "Deployment exists: $SERVICE_NAME"

  # Check ready replicas
  DESIRED=$(kubectl get deployment "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
  READY=$(kubectl get deployment "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')

  if [ "$READY" == "$DESIRED" ]; then
    pass "Replicas ready: $READY/$DESIRED"
  else
    fail "Replicas not ready: $READY/$DESIRED"
  fi

  # Check deployment conditions
  AVAILABLE=$(kubectl get deployment "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Available")].status}')
  if [ "$AVAILABLE" == "True" ]; then
    pass "Deployment available"
  else
    fail "Deployment not available"
  fi
else
  fail "Deployment does not exist: $SERVICE_NAME"
fi

# 2. Check Pods
section "Pods"

POD_COUNT=$(kubectl get pods -n "$NAMESPACE" -l "app=$SERVICE_NAME" --no-headers 2>/dev/null | wc -l)

if [ "$POD_COUNT" -gt 0 ]; then
  pass "Pods found: $POD_COUNT"

  # Check pod status
  RUNNING_PODS=$(kubectl get pods -n "$NAMESPACE" -l "app=$SERVICE_NAME" --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)

  if [ "$RUNNING_PODS" -eq "$POD_COUNT" ]; then
    pass "All pods running: $RUNNING_PODS/$POD_COUNT"
  else
    fail "Not all pods running: $RUNNING_PODS/$POD_COUNT"
  fi

  # Check pod ready state
  NOT_READY=$(kubectl get pods -n "$NAMESPACE" -l "app=$SERVICE_NAME" -o jsonpath='{.items[*].status.containerStatuses[*].ready}' 2>/dev/null | grep -o false | wc -l)

  if [ "$NOT_READY" -eq 0 ]; then
    pass "All containers ready"
  else
    fail "Some containers not ready: $NOT_READY containers"
  fi

  # Check for recent restarts
  RESTART_COUNT=$(kubectl get pods -n "$NAMESPACE" -l "app=$SERVICE_NAME" -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}' 2>/dev/null | awk '{for(i=1;i<=NF;i++) sum+=$i} END {print sum}')

  if [ "$RESTART_COUNT" -eq 0 ]; then
    pass "No container restarts"
  elif [ "$RESTART_COUNT" -lt 5 ]; then
    warn "Container restarts detected: $RESTART_COUNT (may be normal during deployment)"
  else
    fail "Excessive container restarts: $RESTART_COUNT"
  fi
else
  fail "No pods found for app=$SERVICE_NAME"
fi

# 3. Check Service
section "Service"

if kubectl get service "$SERVICE_NAME" -n "$NAMESPACE" &>/dev/null; then
  pass "Service exists: $SERVICE_NAME"

  # Check endpoints
  ENDPOINTS=$(kubectl get endpoints "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null | wc -w)

  if [ "$ENDPOINTS" -gt 0 ]; then
    pass "Service endpoints populated: $ENDPOINTS endpoint(s)"
  else
    fail "Service has no endpoints"
  fi
else
  fail "Service does not exist: $SERVICE_NAME"
fi

# 4. Check Pod Logs
section "Pod Logs"

# Get most recent pod
POD_NAME=$(kubectl get pods -n "$NAMESPACE" -l "app=$SERVICE_NAME" --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}' 2>/dev/null)

if [ -n "$POD_NAME" ]; then
  pass "Checking logs for pod: $POD_NAME"

  # Check for common error patterns
  ERROR_COUNT=$(kubectl logs -n "$NAMESPACE" "$POD_NAME" --tail=100 2>/dev/null | grep -iE "error|exception|fatal|panic" | wc -l)

  if [ "$ERROR_COUNT" -eq 0 ]; then
    pass "No errors in recent logs"
  elif [ "$ERROR_COUNT" -lt 5 ]; then
    warn "Some errors in logs: $ERROR_COUNT line(s) - review manually"
  else
    fail "Multiple errors in logs: $ERROR_COUNT line(s)"
  fi

  # Check for successful startup message (common patterns)
  if kubectl logs -n "$NAMESPACE" "$POD_NAME" --tail=100 2>/dev/null | grep -qiE "listening|started|ready|server.*running"; then
    pass "Server startup message found"
  else
    warn "No obvious startup success message found - verify manually"
  fi
else
  fail "Could not find pod for log inspection"
fi

# 5. Check HTTP Endpoint
section "HTTP Endpoint"

# Check if URL is reachable
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL" || echo "000")

if [ "$HTTP_CODE" == "200" ]; then
  pass "HTTP endpoint returns 200 OK"
elif [ "$HTTP_CODE" == "302" ] || [ "$HTTP_CODE" == "301" ]; then
  warn "HTTP endpoint returns redirect: $HTTP_CODE"
elif [ "$HTTP_CODE" == "000" ]; then
  fail "HTTP endpoint unreachable (timeout or connection error)"
else
  fail "HTTP endpoint returns error: $HTTP_CODE"
fi

# Check response body
RESPONSE_BODY=$(curl -sL --max-time 10 "$URL" 2>/dev/null || echo "")
BODY_SIZE=${#RESPONSE_BODY}

if [ "$BODY_SIZE" -gt 100 ]; then
  pass "Response body size acceptable: $BODY_SIZE bytes"

  # Check for common error indicators
  if echo "$RESPONSE_BODY" | grep -qiE "502 bad gateway|503 service unavailable|404 not found|internal server error|application error"; then
    fail "Response body contains error page"
  else
    pass "Response body appears valid (no obvious error page)"
  fi

  # Check for common framework error pages
  if echo "$RESPONSE_BODY" | grep -qiE "default backend|traefik|nginx.*welcome|apache.*test page"; then
    fail "Response body appears to be default/error page"
  else
    pass "Response body is not a default server page"
  fi
else
  fail "Response body too small: $BODY_SIZE bytes (likely error or empty page)"
fi

# 6. Check Health Endpoint (if exists)
section "Health Endpoint (Optional)"

HEALTH_URL="${URL}/health"
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")

if [ "$HEALTH_CODE" == "200" ]; then
  pass "Health endpoint exists and returns 200 OK"

  # Try to parse health response
  HEALTH_BODY=$(curl -s --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "")
  if echo "$HEALTH_BODY" | jq . &>/dev/null; then
    pass "Health endpoint returns valid JSON"

    # Check for status field
    STATUS=$(echo "$HEALTH_BODY" | jq -r '.status // empty' 2>/dev/null)
    if [ "$STATUS" == "healthy" ] || [ "$STATUS" == "ok" ]; then
      pass "Health status: $STATUS"
    elif [ -n "$STATUS" ]; then
      warn "Health status: $STATUS (not 'healthy' or 'ok')"
    fi
  fi
elif [ "$HEALTH_CODE" == "404" ]; then
  warn "Health endpoint not implemented (404)"
else
  warn "Health endpoint check inconclusive: $HEALTH_CODE"
fi

# 7. Check Ingress (if exists)
section "Ingress (Optional)"

if kubectl get ingress -n "$NAMESPACE" 2>/dev/null | grep -q "$SERVICE_NAME"; then
  pass "Ingress resource exists"

  # Check ingress hosts
  HOSTS=$(kubectl get ingress -n "$NAMESPACE" -o jsonpath='{.items[*].spec.rules[*].host}' 2>/dev/null)
  if [ -n "$HOSTS" ]; then
    pass "Ingress hosts configured: $HOSTS"
  else
    warn "No hosts configured in ingress"
  fi
else
  warn "No ingress resource found (may use service directly)"
fi

# Summary
echo ""
echo "============================================"
echo "Validation Summary"
echo "============================================"
echo -e "${GREEN}Passed:${NC}   $PASSED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "${RED}Failed:${NC}   $FAILED"
echo "============================================"

# Exit code
if [ "$FAILED" -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✓ Deployment validation PASSED${NC}"
  echo ""
  exit 0
else
  echo ""
  echo -e "${RED}✗ Deployment validation FAILED${NC}"
  echo ""
  echo "Review the failures above and fix before merging."
  exit 1
fi
