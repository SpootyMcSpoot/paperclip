# Staple MCP Server

Model Context Protocol server for Staple.

This package is a thin MCP wrapper over the existing Staple REST API. It does
not talk to the database directly and it does not reimplement business logic.

## Authentication

The server reads its configuration from environment variables:

- `STAPLE_API_URL` - Staple base URL, for example `http://localhost:3100`
- `STAPLE_API_KEY` - bearer token used for `/api` requests
- `STAPLE_COMPANY_ID` - optional default company for company-scoped tools
- `STAPLE_AGENT_ID` - optional default agent for checkout helpers
- `STAPLE_RUN_ID` - optional run id forwarded on mutating requests

## Usage

```sh
npx -y @stapleai/mcp-server
```

Or locally in this repo:

```sh
pnpm --filter @stapleai/mcp-server build
node packages/mcp-server/dist/stdio.js
```

## Tool Surface

Read tools:

- `stapleMe`
- `stapleInboxLite`
- `stapleListAgents`
- `stapleGetAgent`
- `stapleListIssues`
- `stapleGetIssue`
- `stapleGetHeartbeatContext`
- `stapleListComments`
- `stapleGetComment`
- `stapleListIssueApprovals`
- `stapleListDocuments`
- `stapleGetDocument`
- `stapleListDocumentRevisions`
- `stapleListProjects`
- `stapleGetProject`
- `stapleGetIssueWorkspaceRuntime`
- `stapleWaitForIssueWorkspaceService`
- `stapleListGoals`
- `stapleGetGoal`
- `stapleListApprovals`
- `stapleGetApproval`
- `stapleGetApprovalIssues`
- `stapleListApprovalComments`

Write tools:

- `stapleCreateIssue`
- `stapleUpdateIssue`
- `stapleCheckoutIssue`
- `stapleReleaseIssue`
- `stapleAddComment`
- `stapleSuggestTasks`
- `stapleAskUserQuestions`
- `stapleRequestConfirmation`
- `stapleUpsertIssueDocument`
- `stapleRestoreIssueDocumentRevision`
- `stapleControlIssueWorkspaceServices`
- `stapleCreateApproval`
- `stapleLinkIssueApproval`
- `stapleUnlinkIssueApproval`
- `stapleApprovalDecision`
- `stapleAddApprovalComment`

Escape hatch:

- `stapleApiRequest`

`stapleApiRequest` is limited to paths under `/api` and JSON bodies. It is
meant for endpoints that do not yet have a dedicated MCP tool.
