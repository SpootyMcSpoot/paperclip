import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./customers.js";
import { agents } from "./agents.js";

export const seoProjects = pgTable("seo_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  domain: text("domain").notNull(),
  keywords: text("keywords"), // JSON array of tracked keywords
  auditSchedule: text("audit_schedule").notNull().default("weekly"), // 'daily', 'weekly', 'monthly'
  lastAuditAt: timestamp("last_audit_at", { withTimezone: true }),
  nextAuditAt: timestamp("next_audit_at", { withTimezone: true }),
  healthScore: integer("health_score"), // 0-100
  technicalIssues: integer("technical_issues").notNull().default(0),
  contentIssues: integer("content_issues").notNull().default(0),
  backlinkCount: integer("backlink_count").notNull().default(0),
  organicTraffic: integer("organic_traffic"),
  keywordRankings: text("keyword_rankings"), // JSON: {keyword: rank}
  recommendations: text("recommendations"), // JSON array of SEO recommendations
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
