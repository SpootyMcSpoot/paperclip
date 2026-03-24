import type { GoalLevel, GoalStatus, GoalProgressWeight } from "../constants.js";

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  level: GoalLevel;
  status: GoalStatus;
  parentId: string | null;
  ownerAgentId: string | null;
  startDate: string | null;
  dueDate: string | null;
  progressWeight: GoalProgressWeight;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalKeyResult {
  id: string;
  goalId: string;
  companyId: string;
  title: string;
  metricType: string;
  targetValue: string;
  currentValue: string;
  startValue: string;
  unit: string | null;
  weight: number;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalProgress {
  goalId: string;
  overallProgress: number;
  keyResultsProgress: number;
  issueCompletionProgress: number;
  childGoalsProgress: number;
  keyResults: GoalKeyResultProgress[];
}

export interface GoalKeyResultProgress {
  id: string;
  title: string;
  progress: number;
  currentValue: string;
  targetValue: string;
  startValue: string;
  unit: string | null;
  status: string;
}
