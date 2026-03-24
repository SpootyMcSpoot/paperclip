#!/bin/bash
# Staple Development Workspace Deployment Validation
#
# Purpose: Validates the deployment of the new development workspace feature
# Usage: ./.claude/validate-development-workspace.sh [--namespace staple] [--url https://staple.spooty.io]
#
# This script validates:
# 1. Kubernetes resources (pods, services, endpoints, ingress)
# 2. Application health endpoint
# 3. Monaco Editor assets in container
# 4. Browser-based validation (if Playwright available)
#
# Exit codes:
#   0 - All validations passed
#   1 - One or more validations failed
#
# Requirements:
# - kubectl configured with cluster access
# - curl
# - jq
# - Optional: node + playwright for browser tests

set -euo pipefail

# Default configuration
NAMESPACE="${STAPLE_NAMESPACE:-staple}"
BASE_URL="${STAPLE_URL:-https://staple.spooty.io}"
DEPLOYMENT_NAME="staple"
SERVICE_NAME="staple"
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --url)
            BASE_URL="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            head -n 20 "$0" | grep "^#" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${YELLOW}[DEBUG]${NC} $*"
    fi
}

pass() {
    echo -e "${GREEN}✓${NC} $*"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $*"
    ((FAILED++))
}

section() {
    echo ""
    echo "========================================"
    echo "$*"
    echo "========================================"
}

# Validation functions
validate_namespace() {
    section "1. Namespace Validation"

    if kubectl get namespace "$NAMESPACE" &>/dev/null; then
        pass "Namespace '$NAMESPACE' exists"
        return 0
    else
        fail "Namespace '$NAMESPACE' does not exist"
        return 1
    fi
}

validate_deployment() {
    section "2. Deployment Validation"

    if ! kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" &>/dev/null; then
        fail "Deployment '$DEPLOYMENT_NAME' not found in namespace '$NAMESPACE'"
        return 1
    fi

    # Check deployment status
    local ready_replicas
    local desired_replicas
    ready_replicas=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    desired_replicas=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')

    if [[ "$ready_replicas" == "$desired_replicas" ]] && [[ "$ready_replicas" -gt 0 ]]; then
        pass "Deployment ready: $ready_replicas/$desired_replicas replicas"
    else
        fail "Deployment not ready: $ready_replicas/$desired_replicas replicas"
        log_verbose "$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE")"
        return 1
    fi
}

validate_pods() {
    section "3. Pod Validation"

    local pods
    pods=$(kubectl get pods -n "$NAMESPACE" -l app="$DEPLOYMENT_NAME" -o json)

    if [[ $(echo "$pods" | jq '.items | length') -eq 0 ]]; then
        fail "No pods found with label app=$DEPLOYMENT_NAME"
        return 1
    fi

    local all_running=true
    local all_ready=true

    while IFS= read -r pod_name; do
        local phase
        local ready_containers
        local total_containers

        phase=$(echo "$pods" | jq -r ".items[] | select(.metadata.name == \"$pod_name\") | .status.phase")
        ready_containers=$(echo "$pods" | jq -r ".items[] | select(.metadata.name == \"$pod_name\") | .status.containerStatuses | map(select(.ready == true)) | length")
        total_containers=$(echo "$pods" | jq -r ".items[] | select(.metadata.name == \"$pod_name\") | .status.containerStatuses | length")

        if [[ "$phase" != "Running" ]]; then
            fail "Pod $pod_name is in phase: $phase (expected Running)"
            all_running=false
        elif [[ "$ready_containers" != "$total_containers" ]]; then
            fail "Pod $pod_name containers: $ready_containers/$total_containers ready"
            all_ready=false
        else
            pass "Pod $pod_name: Running, $ready_containers/$total_containers ready"
        fi
    done < <(echo "$pods" | jq -r '.items[].metadata.name')

    if [[ "$all_running" == "true" ]] && [[ "$all_ready" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

validate_pod_logs() {
    section "4. Pod Logs Validation"

    local pod_name
    pod_name=$(kubectl get pods -n "$NAMESPACE" -l app="$DEPLOYMENT_NAME" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [[ -z "$pod_name" ]]; then
        fail "No pod found to check logs"
        return 1
    fi

    log_info "Checking logs from pod: $pod_name"

    # Check for common error patterns in last 100 lines
    local logs
    logs=$(kubectl logs "$pod_name" -n "$NAMESPACE" --tail=100 2>&1)

    local error_count
    error_count=$(echo "$logs" | grep -iE "(error|exception|fatal|panic|crash)" | grep -viE "(error: 0|no errors|0 errors)" | wc -l)

    if [[ "$error_count" -gt 0 ]]; then
        log_warn "Found $error_count error-like lines in recent logs"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$logs" | grep -iE "(error|exception|fatal|panic|crash)" | grep -viE "(error: 0|no errors|0 errors)" | head -n 10
        fi
        fail "Errors found in pod logs (use --verbose to see details)"
        return 1
    else
        pass "No errors found in recent pod logs"
        return 0
    fi
}

validate_service() {
    section "5. Service Validation"

    if ! kubectl get service "$SERVICE_NAME" -n "$NAMESPACE" &>/dev/null; then
        fail "Service '$SERVICE_NAME' not found"
        return 1
    fi

    pass "Service '$SERVICE_NAME' exists"

    # Check service endpoints
    local endpoints
    endpoints=$(kubectl get endpoints "$SERVICE_NAME" -n "$NAMESPACE" -o json)
    local endpoint_count
    endpoint_count=$(echo "$endpoints" | jq '[.subsets[]?.addresses[]?] | length')

    if [[ "$endpoint_count" -gt 0 ]]; then
        pass "Service has $endpoint_count endpoint(s)"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$endpoints" | jq -r '.subsets[]?.addresses[]? | "\(.ip):\(.targetRef.name)"'
        fi
        return 0
    else
        fail "Service has no endpoints"
        return 1
    fi
}

validate_ingress() {
    section "6. Ingress Validation"

    # Check for IngressRoute (Traefik CRD) or standard Ingress
    local ingress_found=false

    # Check for IngressRoute
    if kubectl get ingressroute -n "$NAMESPACE" &>/dev/null 2>&1; then
        local routes
        routes=$(kubectl get ingressroute -n "$NAMESPACE" -o json 2>/dev/null || echo '{"items":[]}')
        if [[ $(echo "$routes" | jq '.items | length') -gt 0 ]]; then
            pass "Found $(echo "$routes" | jq '.items | length') IngressRoute(s)"
            ingress_found=true

            if [[ "$VERBOSE" == "true" ]]; then
                echo "$routes" | jq -r '.items[] | "\(.metadata.name): \(.spec.routes[].match)"'
            fi
        fi
    fi

    # Check for standard Ingress
    if kubectl get ingress -n "$NAMESPACE" &>/dev/null 2>&1; then
        local ingresses
        ingresses=$(kubectl get ingress -n "$NAMESPACE" -o json 2>/dev/null || echo '{"items":[]}')
        if [[ $(echo "$ingresses" | jq '.items | length') -gt 0 ]]; then
            pass "Found $(echo "$ingresses" | jq '.items | length') Ingress(es)"
            ingress_found=true

            if [[ "$VERBOSE" == "true" ]]; then
                echo "$ingresses" | jq -r '.items[] | "\(.metadata.name): \(.spec.rules[].host)"'
            fi
        fi
    fi

    if [[ "$ingress_found" == "false" ]]; then
        fail "No Ingress or IngressRoute found"
        return 1
    fi

    return 0
}

validate_health_endpoint() {
    section "7. Health Endpoint Validation"

    local health_url="${BASE_URL}/api/health"
    log_info "Checking: $health_url"

    local response
    local status_code

    response=$(curl -sL -w "\n%{http_code}" "$health_url" 2>&1 || echo -e "\n000")
    status_code=$(echo "$response" | tail -n 1)
    local body=$(echo "$response" | sed '$d')

    if [[ "$status_code" != "200" ]]; then
        fail "Health endpoint returned HTTP $status_code (expected 200)"
        log_verbose "Response body: $body"
        return 1
    fi

    pass "Health endpoint returned HTTP 200"

    # Try to parse as JSON and show status
    if echo "$body" | jq . &>/dev/null; then
        local status
        status=$(echo "$body" | jq -r '.status // .health // "unknown"')
        log_info "Health status: $status"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$body" | jq .
        fi
    fi

    return 0
}

validate_monaco_assets() {
    section "8. Monaco Editor Assets Validation"

    local pod_name
    pod_name=$(kubectl get pods -n "$NAMESPACE" -l app="$DEPLOYMENT_NAME" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [[ -z "$pod_name" ]]; then
        fail "No pod found to check Monaco assets"
        return 1
    fi

    log_info "Checking Monaco assets in pod: $pod_name"

    # Common paths where Monaco might be in a React build
    local monaco_paths=(
        "/app/dist/static/js"
        "/app/build/static/js"
        "/usr/share/nginx/html/static/js"
        "/app/public"
    )

    local found_monaco=false

    for path in "${monaco_paths[@]}"; do
        if kubectl exec "$pod_name" -n "$NAMESPACE" -- sh -c "ls -la $path 2>/dev/null | grep -i monaco" &>/dev/null; then
            pass "Monaco assets found in: $path"
            found_monaco=true

            if [[ "$VERBOSE" == "true" ]]; then
                kubectl exec "$pod_name" -n "$NAMESPACE" -- sh -c "ls -lh $path | grep -i monaco" 2>/dev/null || true
            fi
            break
        fi
    done

    if [[ "$found_monaco" == "false" ]]; then
        log_warn "Could not locate Monaco assets in common paths"
        log_info "Checking for monaco in node_modules (development mode)..."

        if kubectl exec "$pod_name" -n "$NAMESPACE" -- sh -c "find /app -name '*monaco*' -type d 2>/dev/null | head -n 5" | grep -q monaco; then
            pass "Monaco found in node_modules (dev mode)"
            found_monaco=true
        else
            fail "Monaco Editor assets not found in container"
            return 1
        fi
    fi

    return 0
}

validate_development_route() {
    section "9. Development Workspace Route Validation"

    local dev_url="${BASE_URL}/test-company/development"
    log_info "Checking: $dev_url"

    local response
    local status_code

    response=$(curl -sL -w "\n%{http_code}" "$dev_url" 2>&1 || echo -e "\n000")
    status_code=$(echo "$response" | tail -n 1)
    local body=$(echo "$response" | sed '$d')

    if [[ "$status_code" != "200" ]]; then
        fail "Development route returned HTTP $status_code (expected 200)"
        log_verbose "Response body (first 500 chars): ${body:0:500}"
        return 1
    fi

    pass "Development route returned HTTP 200"

    # Check for React app indicators
    if echo "$body" | grep -q "root"; then
        log_info "Found React root element in response"
    fi

    # Check for Monaco or development-related content
    if echo "$body" | grep -iq "monaco\|development\|editor"; then
        log_info "Found development workspace related content"
    fi

    # Check body size (empty page would be suspicious)
    local body_size=${#body}
    if [[ $body_size -lt 100 ]]; then
        log_warn "Response body is very small ($body_size bytes) - might be empty page"
        fail "Development route returned suspiciously small response"
        return 1
    else
        pass "Response body size: $body_size bytes"
    fi

    return 0
}

run_playwright_tests() {
    section "10. Browser Validation (Playwright)"

    local script_dir
    script_dir=$(cd "$(dirname "$0")" && pwd)
    local playwright_test="$script_dir/playwright-development-workspace.spec.js"

    if [[ ! -f "$playwright_test" ]]; then
        log_warn "Playwright test not found at: $playwright_test"
        log_info "Skipping browser validation (create test file to enable)"
        return 0
    fi

    if ! command -v node &>/dev/null; then
        log_warn "Node.js not found - skipping Playwright tests"
        return 0
    fi

    if ! node -e "require('@playwright/test')" &>/dev/null; then
        log_warn "Playwright not installed - skipping browser tests"
        log_info "Install with: npm install -D @playwright/test && npx playwright install"
        return 0
    fi

    log_info "Running Playwright browser tests..."

    if STAPLE_URL="$BASE_URL" npx playwright test "$playwright_test" --reporter=line; then
        pass "Playwright browser tests passed"
        return 0
    else
        fail "Playwright browser tests failed"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting Staple Development Workspace validation"
    log_info "Namespace: $NAMESPACE"
    log_info "Base URL: $BASE_URL"
    echo ""

    # Run all validations
    validate_namespace || true
    validate_deployment || true
    validate_pods || true
    validate_pod_logs || true
    validate_service || true
    validate_ingress || true
    validate_health_endpoint || true
    validate_monaco_assets || true
    validate_development_route || true
    run_playwright_tests || true

    # Summary
    section "Validation Summary"
    echo "Passed: $PASSED"
    echo "Failed: $FAILED"

    if [[ $FAILED -eq 0 ]]; then
        echo ""
        log_info "All validations passed!"
        exit 0
    else
        echo ""
        log_error "$FAILED validation(s) failed"
        exit 1
    fi
}

main
