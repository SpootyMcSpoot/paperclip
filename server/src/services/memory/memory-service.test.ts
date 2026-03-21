import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isQdrantConfigured, checkQdrantHealth } from "./qdrant-client.js";

describe("Memory Service", () => {
  describe("Configuration", () => {
    it("should detect if Qdrant is configured", () => {
      const configured = isQdrantConfigured();
      expect(typeof configured).toBe("boolean");
    });

    it("should allow checking Qdrant health", async () => {
      if (!isQdrantConfigured()) {
        console.log("Qdrant not configured, skipping health check");
        return;
      }

      const healthy = await checkQdrantHealth();
      expect(typeof healthy).toBe("boolean");
    });
  });

  // Integration tests would go here
  // These require a running Qdrant instance and database
});
