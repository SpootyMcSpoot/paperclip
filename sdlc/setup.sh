#!/usr/bin/env bash
# Setup script for Anomalous Ventures SDLC pipeline in Staple.
# Creates company, project, and autonomous agents.
#
# Usage:
#   STAPLE_URL=https://staple.spooty.io ./sdlc/setup.sh
#
# Requires:
#   - STAPLE_URL (default: http://localhost:3100)
#   - STAPLE_API_KEY or valid session cookie
#   - jq

set -euo pipefail

STAPLE_URL="${STAPLE_URL:-http://localhost:3100}"
API="${STAPLE_URL}/api"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Auth header: API key or cookie
if [[ -n "${STAPLE_API_KEY:-}" ]]; then
  AUTH_HEADER="Authorization: Bearer ${STAPLE_API_KEY}"
else
  echo "ERROR: STAPLE_API_KEY is required"
  exit 1
fi

api() {
  local method="$1" path="$2"
  shift 2
  curl -sf -X "$method" "${API}${path}" \
    -H "Content-Type: application/json" \
    -H "$AUTH_HEADER" \
    "$@"
}

echo "=== Anomalous Ventures SDLC Pipeline Setup ==="
echo "Staple: ${STAPLE_URL}"
echo ""

# ---------------------------------------------------------------
# 1. Create Company
# ---------------------------------------------------------------
echo "[1/4] Creating company: Anomalous Ventures"
COMPANY=$(api POST /companies -d '{
  "name": "Anomalous Ventures",
  "description": "Autonomous SDLC pipeline for internal projects"
}')
COMPANY_ID=$(echo "$COMPANY" | jq -r '.id')
echo "  Company ID: ${COMPANY_ID}"

# ---------------------------------------------------------------
# 2. Create Project with workspace
# ---------------------------------------------------------------
echo "[2/4] Creating project: staple-ai"
PROJECT=$(api POST "/companies/${COMPANY_ID}/projects" -d '{
  "name": "staple-ai",
  "description": "Staple - orchestration platform for autonomous AI companies",
  "status": "in_progress",
  "workspace": {
    "name": "staple-ai",
    "sourceType": "git_repo",
    "repoUrl": "https://github.com/Anomalous-Ventures/staple",
    "defaultRef": "master",
    "isPrimary": true
  }
}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
echo "  Project ID: ${PROJECT_ID}"

# ---------------------------------------------------------------
# 3. Create Agents
# ---------------------------------------------------------------
echo "[3/4] Creating agents..."

# Developer agent
echo "  Creating: Developer"
DEV_AGENT=$(api POST "/companies/${COMPANY_ID}/agents" -d '{
  "name": "Developer",
  "role": "engineer",
  "title": "Senior Engineer",
  "adapterType": "claude_local",
  "adapterConfig": {
    "dangerouslySkipPermissions": true,
    "instructionsFilePath": "/app/sdlc/instructions/developer.md",
    "maxTurnsPerRun": 50,
    "model": "opus"
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": true,
      "intervalSec": 1800
    }
  },
  "capabilities": "Writes code, creates PRs, fixes bugs, implements features. Autonomous up to staging."
}')
DEV_ID=$(echo "$DEV_AGENT" | jq -r '.id')
echo "    Agent ID: ${DEV_ID}"

# Reviewer agent
echo "  Creating: Reviewer"
REV_AGENT=$(api POST "/companies/${COMPANY_ID}/agents" -d '{
  "name": "Reviewer",
  "role": "qa",
  "title": "Code Reviewer",
  "adapterType": "claude_local",
  "adapterConfig": {
    "dangerouslySkipPermissions": true,
    "instructionsFilePath": "/app/sdlc/instructions/reviewer.md",
    "maxTurnsPerRun": 30,
    "model": "opus"
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": false,
      "intervalSec": 0
    }
  },
  "capabilities": "Reviews PRs, requests changes, approves code. Triggered on demand."
}')
REV_ID=$(echo "$REV_AGENT" | jq -r '.id')
echo "    Agent ID: ${REV_ID}"

# Tester agent
echo "  Creating: Tester"
TEST_AGENT=$(api POST "/companies/${COMPANY_ID}/agents" -d '{
  "name": "Tester",
  "role": "qa",
  "title": "QA Engineer",
  "adapterType": "claude_local",
  "adapterConfig": {
    "dangerouslySkipPermissions": true,
    "instructionsFilePath": "/app/sdlc/instructions/tester.md",
    "maxTurnsPerRun": 30,
    "model": "opus"
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": false,
      "intervalSec": 0
    }
  },
  "capabilities": "Runs tests, reports results, writes missing tests. Triggered on demand."
}')
TEST_ID=$(echo "$TEST_AGENT" | jq -r '.id')
echo "    Agent ID: ${TEST_ID}"

# Planner agent
echo "  Creating: Planner"
PLAN_AGENT=$(api POST "/companies/${COMPANY_ID}/agents" -d '{
  "name": "Planner",
  "role": "pm",
  "title": "Technical PM",
  "adapterType": "claude_local",
  "adapterConfig": {
    "dangerouslySkipPermissions": true,
    "instructionsFilePath": "/app/sdlc/instructions/planner.md",
    "maxTurnsPerRun": 20,
    "model": "opus"
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": true,
      "intervalSec": 3600
    }
  },
  "capabilities": "Reads roadmap, creates issues, breaks down work, prioritizes backlog."
}')
PLAN_ID=$(echo "$PLAN_AGENT" | jq -r '.id')
echo "    Agent ID: ${PLAN_ID}"

# ---------------------------------------------------------------
# 4. Summary
# ---------------------------------------------------------------
echo ""
echo "[4/4] Setup complete"
echo ""
echo "Company:  ${COMPANY_ID}  (Anomalous Ventures)"
echo "Project:  ${PROJECT_ID}  (staple-ai)"
echo "Agents:"
echo "  Developer: ${DEV_ID}  (heartbeat: 30min)"
echo "  Reviewer:  ${REV_ID}  (on-demand)"
echo "  Tester:    ${TEST_ID}  (on-demand)"
echo "  Planner:   ${PLAN_ID}  (heartbeat: 60min)"
echo ""
echo "To create a test issue:"
echo "  curl -X POST ${API}/companies/${COMPANY_ID}/issues \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H '${AUTH_HEADER}' \\"
echo "    -d '{\"title\": \"Add health check endpoint\", \"projectId\": \"${PROJECT_ID}\", \"assigneeAgentId\": \"${DEV_ID}\"}'"
