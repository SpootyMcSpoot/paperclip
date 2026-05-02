// Contract tests for packages/shared/src/execution-workspace-guards.ts.
//
// These guards drive the issue-linking UI: every comment/resume action
// runs `isClosedIsolatedExecutionWorkspace` first to decide whether to
// flash the "move to an open workspace" warning. Drift here either
// (a) silently lets writes land in archived workspaces (data drifts
//     into a workspace that's already been cleaned up), or
// (b) blocks writes on still-open shared workspaces (false-positive
//     blocks every shared-workspace user from doing anything).
//
// Pinned:
//   - null/undefined input -> false (no-workspace path doesn't lock UI)
//   - mode !== "isolated_workspace" -> false (only isolated mode is gated)
//   - closedAt non-null -> true (when isolated)
//   - status in {archived, cleanup_failed} -> true (when isolated)
//   - status NOT in closed set + closedAt null -> false (active iso ws)
//   - cleanup_failed status (terminal failure) IS treated as closed
//   - Message includes the workspace name verbatim (UI rendering pin)
import { describe, expect, it } from "vitest";
import {
  getClosedIsolatedExecutionWorkspaceMessage,
  isClosedIsolatedExecutionWorkspace,
} from "./execution-workspace-guards.js";

describe("isClosedIsolatedExecutionWorkspace", () => {
  it("returns false for null", () => {
    // No-workspace path: the guard MUST NOT crash or block when
    // there's no linked workspace -- callers depend on the falsy
    // return to skip the warning.
    expect(isClosedIsolatedExecutionWorkspace(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isClosedIsolatedExecutionWorkspace(undefined)).toBe(false);
  });

  it("returns false when mode is not isolated_workspace", () => {
    // Pin: ONLY isolated workspaces are gated. A shared workspace
    // with archived status MUST NOT block writes -- that's the bug
    // class of "false-positive blocks every shared-workspace user."
    expect(
      isClosedIsolatedExecutionWorkspace({
        mode: "shared_workspace" as never,
        status: "archived",
        closedAt: "2026-04-01T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("returns true when isolated + closedAt is set", () => {
    expect(
      isClosedIsolatedExecutionWorkspace({
        mode: "isolated_workspace",
        status: "active" as never,
        closedAt: "2026-04-01T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("returns true when isolated + status archived", () => {
    expect(
      isClosedIsolatedExecutionWorkspace({
        mode: "isolated_workspace",
        status: "archived",
        closedAt: null,
      }),
    ).toBe(true);
  });

  it("returns true when isolated + status cleanup_failed", () => {
    // Pin: cleanup_failed is a TERMINAL failure -- the workspace
    // is dead even if cleanup didn't finish. Letting writes land
    // here would queue them against tombstoned infra.
    expect(
      isClosedIsolatedExecutionWorkspace({
        mode: "isolated_workspace",
        status: "cleanup_failed",
        closedAt: null,
      }),
    ).toBe(true);
  });

  it("returns false when isolated + active + no closedAt", () => {
    // The happy path: the warning MUST NOT fire on live workspaces.
    expect(
      isClosedIsolatedExecutionWorkspace({
        mode: "isolated_workspace",
        status: "active" as never,
        closedAt: null,
      }),
    ).toBe(false);
  });

  it("returns false when isolated + active + closedAt undefined", () => {
    // closedAt typed as string|null at the model layer, but live
    // payloads can omit the key entirely. Pin both the null and
    // missing-key cases as non-closed.
    expect(
      isClosedIsolatedExecutionWorkspace({
        mode: "isolated_workspace",
        status: "active" as never,
        closedAt: undefined as never,
      }),
    ).toBe(false);
  });
});

describe("getClosedIsolatedExecutionWorkspaceMessage", () => {
  it("includes the workspace name verbatim", () => {
    // Pin: the UI renders this string into a toast / inline banner.
    // The workspace name MUST appear as-is so users can identify
    // which closed workspace they're trying to write to.
    const msg = getClosedIsolatedExecutionWorkspaceMessage({ name: "ws-alpha-42" });
    expect(msg).toContain("ws-alpha-42");
    expect(msg).toContain("closed workspace");
  });

  it("quotes the name", () => {
    // Pin: the name is wrapped in double quotes -- the launch UI
    // text-truncates around the quotes, so dropping them rebuilds
    // every truncation regression.
    const msg = getClosedIsolatedExecutionWorkspaceMessage({ name: "demo" });
    expect(msg).toContain('"demo"');
  });

  it("mentions the recovery path (move to open workspace)", () => {
    // Pin: the actionable hint MUST tell the user what to do next.
    // Drift to a generic "this is closed" leaves users stuck.
    const msg = getClosedIsolatedExecutionWorkspaceMessage({ name: "x" });
    expect(msg.toLowerCase()).toContain("open workspace");
  });
});
