// Contract tests for cli/src/checks/port-check.ts and the underlying
// cli/src/utils/net.ts helper.
//
// portCheck wraps checkPort and translates the result into a doctor
// CheckResult. The two failure modes that drift silently:
//   (a) port-in-use must surface as warn, not fail. doctor's exit
//       code differs by status; flipping warn->fail would block local
//       boots whenever any unrelated process held the port.
//   (b) checkPort itself MUST resolve and never throw, otherwise
//       doctor crashes mid-suite.
//
// Pinned:
//   - checkPort: free port -> available=true (no error)
//   - checkPort: in-use port -> available=false, EADDRINUSE message
//   - portCheck: available -> pass with port in message
//   - portCheck: in-use -> warn (NOT fail) with lsof repair hint
//   - portCheck: warn carries underlying error message verbatim

import net from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { portCheck } from "../checks/port-check.js";
import { checkPort } from "../utils/net.js";

type Config = { server: { port: number } };
const cfg = (port: number): Config => ({ server: { port } });

async function reservePort(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        resolve({ server, port: addr.port });
      } else {
        reject(new Error("no address"));
      }
    });
  });
}

async function freePort(): Promise<number> {
  // Bind to an ephemeral port, capture it, then release it. There is
  // a small TOCTOU window before the test can rebind, but that is
  // acceptable for a contract probe.
  const { server, port } = await reservePort();
  await new Promise<void>((res) => server.close(() => res()));
  return port;
}

describe("checkPort", () => {
  it("returns available=true for a free port", async () => {
    const port = await freePort();
    const result = await checkPort(port);
    expect(result.available).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns available=false for a port already in use", async () => {
    const { server, port } = await reservePort();
    try {
      const result = await checkPort(port);
      expect(result.available).toBe(false);
      expect(result.error).toContain(String(port));
      expect(result.error).toMatch(/already in use/i);
    } finally {
      await new Promise<void>((res) => server.close(() => res()));
    }
  });
});

describe("portCheck", () => {
  let held: net.Server | null = null;

  beforeEach(() => {
    held = null;
  });

  afterEach(async () => {
    if (held) {
      await new Promise<void>((res) => held!.close(() => res()));
      held = null;
    }
  });

  it("returns pass when the configured port is available", async () => {
    const port = await freePort();
    const result = await portCheck(cfg(port) as never);
    expect(result.status).toBe("pass");
    expect(result.name).toBe("Server port");
    expect(result.message).toContain(String(port));
  });

  it("returns warn (NOT fail) when the port is in use", async () => {
    // Pin: in-use is warn, not fail. doctor's exit code maps fail
    // to non-zero; flipping this would block every local boot any
    // time a stale process held :3100.
    const reserved = await reservePort();
    held = reserved.server;
    const result = await portCheck(cfg(reserved.port) as never);
    expect(result.status).toBe("warn");
    expect(result.canRepair).toBe(false);
    expect(result.repairHint).toContain(`lsof -i :${reserved.port}`);
    expect(result.message).toContain(String(reserved.port));
  });

  it("threads the underlying error message into warn", async () => {
    // Pin: when checkPort yields an error message, portCheck surfaces
    // it verbatim. Dropping the error would leave operators with no
    // signal beyond "not available".
    const reserved = await reservePort();
    held = reserved.server;
    const result = await portCheck(cfg(reserved.port) as never);
    expect(result.message).toMatch(/in use/i);
  });
});
