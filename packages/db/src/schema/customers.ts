import { pgTable, uuid, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  stripeCustomerId: text("stripe_customer_id"),
  subscriptionTier: text("subscription_tier"), // 'starter', 'growth', 'enterprise'
  subscriptionProduct: text("subscription_product"), // 'visiblai', 'marketing', 'staple'
  mrrCents: integer("mrr_cents").notNull().default(0),
  status: text("status").notNull().default("trial"), // 'trial', 'active', 'paused', 'churned'
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  churnedAt: timestamp("churned_at", { withTimezone: true }),
  churnReason: text("churn_reason"),
  metadata: text("metadata"), // JSON string for additional data
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
