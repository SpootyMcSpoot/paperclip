import { z } from "zod";
import {
  GOAL_LEVELS,
  GOAL_STATUSES,
  GOAL_PROGRESS_WEIGHTS,
  KEY_RESULT_METRIC_TYPES,
  KEY_RESULT_STATUSES,
} from "../constants.js";

export const createGoalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  level: z.enum(GOAL_LEVELS).optional().default("task"),
  status: z.enum(GOAL_STATUSES).optional().default("planned"),
  parentId: z.string().uuid().optional().nullable(),
  ownerAgentId: z.string().uuid().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  progressWeight: z.enum(GOAL_PROGRESS_WEIGHTS).optional().default("balanced"),
});

export type CreateGoal = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = createGoalSchema.partial();

export type UpdateGoal = z.infer<typeof updateGoalSchema>;

export const createKeyResultSchema = z.object({
  title: z.string().min(1).max(500),
  metricType: z.enum(KEY_RESULT_METRIC_TYPES).default("number"),
  targetValue: z.string().min(1),
  currentValue: z.string().optional().default("0"),
  startValue: z.string().optional().default("0"),
  unit: z.string().max(50).optional(),
  weight: z.number().int().min(1).max(100).optional().default(1),
  dueDate: z.string().datetime().optional(),
});

export type CreateKeyResult = z.infer<typeof createKeyResultSchema>;

export const updateKeyResultSchema = createKeyResultSchema.partial().extend({
  status: z.enum(KEY_RESULT_STATUSES).optional(),
});

export type UpdateKeyResult = z.infer<typeof updateKeyResultSchema>;
