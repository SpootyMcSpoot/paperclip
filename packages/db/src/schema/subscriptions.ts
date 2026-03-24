import { pgTable, uuid, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { customers } from "./customers.js";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  status: text("status").notNull(), // 'active', 'canceled', 'past_due', 'trialing'
  product: text("product").notNull(), // 'visiblai', 'marketing', 'staple'
  tier: text("tier").notNull(), // 'starter', 'growth', 'enterprise'
  priceCents: integer("price_cents").notNull(),
  billingPeriod: text("billing_period").notNull().default("monthly"), // 'monthly', 'yearly'
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  trialStart: timestamp("trial_start", { withTimezone: true }),
  trialEnd: timestamp("trial_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
