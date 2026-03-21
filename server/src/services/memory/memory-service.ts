import { QdrantClient } from "@qdrant/js-client-rest";
import {
  getQdrantClient,
  getCompanyCollectionName,
  isQdrantConfigured,
} from "./qdrant-client.js";
import type { Database } from "@paperclipai/db";
import { memories } from "@paperclipai/db";
import { eq, and, desc } from "drizzle-orm";

export interface StoreMemoryInput {
  companyId: string;
  agentId?: string;
  content: string;
  metadata?: {
    type?: string;
    source?: string;
    tags?: string[];
    importance?: number;
    [key: string]: unknown;
  };
  issueId?: string;
  documentId?: string;
  heartbeatRunId?: string;
  createdByAgentId?: string;
  createdByUserId?: string;
}

export interface SearchMemoriesInput {
  companyId: string;
  query: string;
  agentId?: string;
  limit?: number;
  scoreThreshold?: number;
}

export interface Memory {
  id: string;
  companyId: string;
  agentId: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  score?: number;
  createdAt: Date;
}

/**
 * Initialize Qdrant collection for a company
 */
async function ensureCollection(client: QdrantClient, companyId: string): Promise<void> {
  const collectionName = getCompanyCollectionName(companyId);

  try {
    // Check if collection exists
    await client.getCollection(collectionName);
  } catch (err) {
    // Collection doesn't exist - create it
    await client.createCollection(collectionName, {
      vectors: {
        size: 1536, // OpenAI embedding size (can be configured)
        distance: "Cosine",
      },
    });
  }
}

/**
 * Generate embedding for text
 *
 * TODO: This is a placeholder. In production, you would:
 * 1. Call your embedding model (OpenAI, sentence-transformers, etc.)
 * 2. Cache embeddings for identical content
 * 3. Handle different embedding model sizes
 *
 * For now, returns a dummy vector for testing.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  // Placeholder: in production, call your embedding service
  // e.g., OpenAI embeddings, sentence-transformers via API, etc.

  // Return dummy 1536-dimensional vector (OpenAI embedding size)
  return Array(1536).fill(0).map(() => Math.random());
}

/**
 * Store a memory in Qdrant and PostgreSQL
 */
export async function storeMemory(
  db: Database,
  input: StoreMemoryInput,
): Promise<{ id: string; qdrantPointId: string }> {
  if (!isQdrantConfigured()) {
    throw new Error("Qdrant is not configured. Set QDRANT_HOST or QDRANT_URL.");
  }

  const client = getQdrantClient();
  const collectionName = getCompanyCollectionName(input.companyId);

  // Ensure collection exists
  await ensureCollection(client, input.companyId);

  // Generate embedding
  const embedding = await generateEmbedding(input.content);

  // Generate point ID
  const pointId = crypto.randomUUID();

  // Store in Qdrant
  await client.upsert(collectionName, {
    wait: true,
    points: [
      {
        id: pointId,
        vector: embedding,
        payload: {
          companyId: input.companyId,
          agentId: input.agentId || null,
          content: input.content,
          metadata: input.metadata || {},
          issueId: input.issueId || null,
          documentId: input.documentId || null,
          heartbeatRunId: input.heartbeatRunId || null,
          createdAt: new Date().toISOString(),
        },
      },
    ],
  });

  // Store metadata in PostgreSQL
  const [memory] = await db
    .insert(memories)
    .values({
      companyId: input.companyId,
      agentId: input.agentId || null,
      content: input.content,
      qdrantCollectionName: collectionName,
      qdrantPointId: pointId,
      metadata: input.metadata || null,
      issueId: input.issueId || null,
      documentId: input.documentId || null,
      heartbeatRunId: input.heartbeatRunId || null,
      createdByAgentId: input.createdByAgentId || null,
      createdByUserId: input.createdByUserId || null,
    })
    .returning({ id: memories.id, qdrantPointId: memories.qdrantPointId });

  return memory;
}

/**
 * Search memories using semantic similarity
 */
export async function searchMemories(
  db: Database,
  input: SearchMemoriesInput,
): Promise<Memory[]> {
  if (!isQdrantConfigured()) {
    throw new Error("Qdrant is not configured. Set QDRANT_HOST or QDRANT_URL.");
  }

  const client = getQdrantClient();
  const collectionName = getCompanyCollectionName(input.companyId);

  // Check if collection exists
  try {
    await client.getCollection(collectionName);
  } catch (err) {
    // Collection doesn't exist - no memories yet
    return [];
  }

  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(input.query);

  // Build filter
  const filter: Record<string, unknown> = {
    must: [{ key: "companyId", match: { value: input.companyId } }],
  };

  if (input.agentId) {
    (filter.must as Array<Record<string, unknown>>).push({
      key: "agentId",
      match: { value: input.agentId },
    });
  }

  // Search Qdrant
  const searchResult = await client.search(collectionName, {
    vector: queryEmbedding,
    filter,
    limit: input.limit || 10,
    score_threshold: input.scoreThreshold || 0.7,
    with_payload: true,
  });

  // Map results to Memory type
  return searchResult.map((result) => ({
    id: result.id.toString(),
    companyId: result.payload?.companyId as string,
    agentId: (result.payload?.agentId as string | null) || null,
    content: result.payload?.content as string,
    metadata: (result.payload?.metadata as Record<string, unknown>) || null,
    score: result.score,
    createdAt: new Date(result.payload?.createdAt as string),
  }));
}

/**
 * Get memories from PostgreSQL (for browsing, not semantic search)
 */
export async function getMemories(
  db: Database,
  companyId: string,
  options: {
    agentId?: string;
    issueId?: string;
    documentId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<Memory[]> {
  const conditions = [eq(memories.companyId, companyId)];

  if (options.agentId) {
    conditions.push(eq(memories.agentId, options.agentId));
  }
  if (options.issueId) {
    conditions.push(eq(memories.issueId, options.issueId));
  }
  if (options.documentId) {
    conditions.push(eq(memories.documentId, options.documentId));
  }

  const results = await db
    .select({
      id: memories.id,
      companyId: memories.companyId,
      agentId: memories.agentId,
      content: memories.content,
      metadata: memories.metadata,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt))
    .limit(options.limit || 50)
    .offset(options.offset || 0);

  return results.map((r) => ({
    ...r,
    metadata: r.metadata as Record<string, unknown> | null,
  }));
}

/**
 * Delete a memory from both Qdrant and PostgreSQL
 */
export async function deleteMemory(
  db: Database,
  memoryId: string,
  companyId: string,
): Promise<void> {
  // Get memory from PostgreSQL
  const [memory] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.companyId, companyId)))
    .limit(1);

  if (!memory) {
    throw new Error("Memory not found");
  }

  // Delete from Qdrant if configured
  if (isQdrantConfigured()) {
    const client = getQdrantClient();
    await client.delete(memory.qdrantCollectionName, {
      wait: true,
      points: [memory.qdrantPointId],
    });
  }

  // Delete from PostgreSQL
  await db
    .delete(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.companyId, companyId)));
}

/**
 * Get memory statistics for a company
 */
export async function getMemoryStats(
  db: Database,
  companyId: string,
): Promise<{
  totalMemories: number;
  memoriesByAgent: Record<string, number>;
  memoriesByType: Record<string, number>;
}> {
  const allMemories = await db
    .select({
      agentId: memories.agentId,
      metadata: memories.metadata,
    })
    .from(memories)
    .where(eq(memories.companyId, companyId));

  const memoriesByAgent: Record<string, number> = {};
  const memoriesByType: Record<string, number> = {};

  for (const memory of allMemories) {
    // Count by agent
    const agentKey = memory.agentId || "unassigned";
    memoriesByAgent[agentKey] = (memoriesByAgent[agentKey] || 0) + 1;

    // Count by type
    const metadata = memory.metadata as { type?: string } | null;
    const typeKey = metadata?.type || "untyped";
    memoriesByType[typeKey] = (memoriesByType[typeKey] || 0) + 1;
  }

  return {
    totalMemories: allMemories.length,
    memoriesByAgent,
    memoriesByType,
  };
}
