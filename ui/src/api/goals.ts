import type { Goal, GoalKeyResult, GoalProgress } from "@paperclipai/shared";
import { api } from "./client";

export const goalsApi = {
  list: (companyId: string) => api.get<Goal[]>(`/companies/${companyId}/goals`),
  get: (id: string) => api.get<Goal>(`/goals/${id}`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Goal>(`/companies/${companyId}/goals`, data),
  update: (id: string, data: Record<string, unknown>) => api.patch<Goal>(`/goals/${id}`, data),
  remove: (id: string) => api.delete<Goal>(`/goals/${id}`),

  getProgress: (goalId: string) => api.get<GoalProgress>(`/goals/${goalId}/progress`),

  listKeyResults: (goalId: string) =>
    api.get<GoalKeyResult[]>(`/goals/${goalId}/key-results`),
  createKeyResult: (goalId: string, data: Record<string, unknown>) =>
    api.post<GoalKeyResult>(`/goals/${goalId}/key-results`, data),
  updateKeyResult: (id: string, data: Record<string, unknown>) =>
    api.patch<GoalKeyResult>(`/key-results/${id}`, data),
  removeKeyResult: (id: string) => api.delete<GoalKeyResult>(`/key-results/${id}`),
};
