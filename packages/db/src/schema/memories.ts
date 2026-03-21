import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";
import { documents } from "./documents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    qdrantCollectionName: text("qdrant_collection_name").notNull(),
    qdrantPointId: text("qdrant_point_id").notNull(),
    metadata: jsonb("metadata").$type<{
      type?: string;
      source?: string;
      tags?: string[];
      importance?: number;
      [key: string]: unknown;
    }>(),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    heartbeatRunId: uuid("heartbeat_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("memories_company_created_idx").on(table.companyId, table.createdAt),
    agentCreatedIdx: index("memories_agent_created_idx").on(table.agentId, table.createdAt),
    qdrantIdx: index("memories_qdrant_idx").on(table.qdrantCollectionName, table.qdrantPointId),
    issueIdx: index("memories_issue_idx").on(table.issueId),
    documentIdx: index("memories_document_idx").on(table.documentId),
  }),
);
