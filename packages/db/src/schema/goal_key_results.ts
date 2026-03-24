import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { goals } from "./goals.js";
import { companies } from "./companies.js";

export const goalKeyResults = pgTable(
  "goal_key_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    title: text("title").notNull(),
    metricType: text("metric_type").notNull().default("number"),
    targetValue: text("target_value").notNull(),
    currentValue: text("current_value").notNull().default("0"),
    startValue: text("start_value").notNull().default("0"),
    unit: text("unit"),
    weight: integer("weight").notNull().default(1),
    status: text("status").notNull().default("not_started"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    goalIdx: index("goal_key_results_goal_idx").on(table.goalId),
    companyIdx: index("goal_key_results_company_idx").on(table.companyId),
  }),
);
