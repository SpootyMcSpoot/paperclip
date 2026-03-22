import { pgTable, uuid, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  productSlug: text("product_slug"), // Reference to product in marketing service
  status: text("status").notNull().default("draft"), // 'draft', 'scheduled', 'publishing', 'published', 'failed'
  platforms: text("platforms"), // JSON array: ['linkedin', 'x', 'reddit']
  content: text("content"), // Generated content
  publishedAt: timestamp("published_at", { withTimezone: true }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  performanceMetrics: text("performance_metrics"), // JSON: {impressions, engagements, clicks}
  externalDraftId: text("external_draft_id"), // ID in marketing service
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
