import type { Express } from "express";
import type { Database } from "@stapleai/db";
import {
  storeMemory,
  searchMemories,
  getMemories,
  deleteMemory,
  getMemoryStats,
  checkQdrantHealth,
  isQdrantConfigured,
  isProductionEmbeddingConfigured,
  getEmbeddingDimensions,
} from "./memory-service.js";

/**
 * Register memory API routes
 *
 * All routes require authentication and company context
 */
export function registerMemoryRoutes(app: Express, db: Database) {
  // Health check
  app.get("/api/memory/health", async (_req, res) => {
    try {
      if (!isQdrantConfigured()) {
        return res.json({
          configured: false,
          healthy: false,
          message: "Qdrant is not configured",
          embedding: {
            configured: false,
          },
        });
      }

      const healthy = await checkQdrantHealth();
      const productionEmbedding = isProductionEmbeddingConfigured();

      res.json({
        configured: true,
        healthy,
        embedding: {
          configured: productionEmbedding,
          dimensions: getEmbeddingDimensions(),
          provider: productionEmbedding ? "production" : "fallback",
          warning: productionEmbedding
            ? undefined
            : "Using local fallback embeddings (not suitable for production)",
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Health check failed" });
    }
  });

  // Store memory
  app.post("/api/companies/:companyId/memories", async (req, res) => {
    try {
      const { companyId } = req.params;
      const {
        content,
        metadata,
        agentId,
        issueId,
        documentId,
        heartbeatRunId,
      } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required" });
      }

      const memory = await storeMemory(db, {
        companyId,
        content,
        metadata,
        agentId,
        issueId,
        documentId,
        heartbeatRunId,
        createdByUserId: (req as any).user?.id, // If auth middleware provides user
      });

      res.json(memory);
    } catch (err) {
      console.error("Store memory error:", err);
      res.status(500).json({ error: "Failed to store memory" });
    }
  });

  // Search memories
  app.post("/api/companies/:companyId/memories/search", async (req, res) => {
    try {
      const { companyId } = req.params;
      const { query, agentId, limit, scoreThreshold } = req.body;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      const results = await searchMemories(db, {
        companyId,
        query,
        agentId,
        limit,
        scoreThreshold,
      });

      res.json({ results });
    } catch (err) {
      console.error("Search memories error:", err);
      res.status(500).json({ error: "Failed to search memories" });
    }
  });

  // Get memories (list/browse)
  app.get("/api/companies/:companyId/memories", async (req, res) => {
    try {
      const { companyId } = req.params;
      const { agentId, issueId, documentId, limit, offset } = req.query;

      const results = await getMemories(db, companyId, {
        agentId: agentId as string | undefined,
        issueId: issueId as string | undefined,
        documentId: documentId as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json({ results });
    } catch (err) {
      console.error("Get memories error:", err);
      res.status(500).json({ error: "Failed to get memories" });
    }
  });

  // Delete memory
  app.delete(
    "/api/companies/:companyId/memories/:memoryId",
    async (req, res) => {
      try {
        const { companyId, memoryId } = req.params;

        await deleteMemory(db, memoryId, companyId);

        res.json({ success: true });
      } catch (err) {
        console.error("Delete memory error:", err);
        res.status(500).json({ error: "Failed to delete memory" });
      }
    },
  );

  // Get memory statistics
  app.get("/api/companies/:companyId/memories/stats", async (req, res) => {
    try {
      const { companyId } = req.params;

      const stats = await getMemoryStats(db, companyId);

      res.json(stats);
    } catch (err) {
      console.error("Get memory stats error:", err);
      res.status(500).json({ error: "Failed to get memory stats" });
    }
  });
}
