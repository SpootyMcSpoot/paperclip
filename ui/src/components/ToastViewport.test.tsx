// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastViewport } from "./ToastViewport";
import type { ToastItem } from "../context/ToastContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockToastState = vi.hoisted(() => ({ toasts: [] as ToastItem[] }));

vi.mock("@/lib/router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../context/ToastContext", () => ({
  useToastState: () => mockToastState.toasts,
  useToastActions: () => ({ dismissToast: vi.fn() }),
}));

describe("ToastViewport", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    mockToastState.toasts = [];
  });

  async function render() {
    await act(async () => {
      root.render(<ToastViewport />);
    });
  }

  it("renders error toast with role=alert and aria-live=assertive", async () => {
    mockToastState.toasts = [
      { id: "t1", title: "Boom", tone: "error", ttlMs: 5000, createdAt: Date.now() },
    ];
    await render();
    const li = container.querySelector("li")!;
    expect(li.getAttribute("role")).toBe("alert");
    expect(li.getAttribute("aria-live")).toBe("assertive");
  });

  it("renders non-error toast without role=alert", async () => {
    mockToastState.toasts = [
      { id: "t2", title: "Saved", tone: "success", ttlMs: 5000, createdAt: Date.now() },
    ];
    await render();
    const li = container.querySelector("li")!;
    expect(li.getAttribute("role")).toBeNull();
    expect(li.getAttribute("aria-live")).toBeNull();
  });
});
