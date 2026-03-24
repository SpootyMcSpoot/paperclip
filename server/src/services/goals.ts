import { and, asc, eq, isNull, inArray } from "drizzle-orm";
import type { Db } from "@stapleai/db";
import { goals, goalKeyResults, issues } from "@stapleai/db";
import type { GoalProgress, GoalKeyResultProgress } from "@stapleai/shared";

type GoalReader = Pick<Db, "select">;

export async function getDefaultCompanyGoal(db: GoalReader, companyId: string) {
  const activeRootGoal = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.companyId, companyId),
        eq(goals.level, "company"),
        eq(goals.status, "active"),
        isNull(goals.parentId),
      ),
    )
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
  if (activeRootGoal) return activeRootGoal;

  const anyRootGoal = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.companyId, companyId),
        eq(goals.level, "company"),
        isNull(goals.parentId),
      ),
    )
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
  if (anyRootGoal) return anyRootGoal;

  return db
    .select()
    .from(goals)
    .where(and(eq(goals.companyId, companyId), eq(goals.level, "company")))
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
}

function computeKeyResultProgress(
  current: string,
  start: string,
  target: string,
): number {
  const c = parseFloat(current);
  const s = parseFloat(start);
  const t = parseFloat(target);
  if (isNaN(c) || isNaN(s) || isNaN(t)) return 0;
  const range = t - s;
  if (range === 0) return t === c ? 100 : 0;
  const progress = ((c - s) / range) * 100;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export function goalService(db: Db) {
  return {
    list: (companyId: string) => db.select().from(goals).where(eq(goals.companyId, companyId)),

    getById: (id: string) =>
      db
        .select()
        .from(goals)
        .where(eq(goals.id, id))
        .then((rows) => rows[0] ?? null),

    getDefaultCompanyGoal: (companyId: string) => getDefaultCompanyGoal(db, companyId),

    create: (companyId: string, data: Omit<typeof goals.$inferInsert, "companyId">) =>
      db
        .insert(goals)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]),

    update: (id: string, data: Partial<typeof goals.$inferInsert>) =>
      db
        .update(goals)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    remove: (id: string) =>
      db
        .delete(goals)
        .where(eq(goals.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    listKeyResults: (goalId: string) =>
      db
        .select()
        .from(goalKeyResults)
        .where(eq(goalKeyResults.goalId, goalId))
        .orderBy(asc(goalKeyResults.createdAt)),

    getKeyResultById: (id: string) =>
      db
        .select()
        .from(goalKeyResults)
        .where(eq(goalKeyResults.id, id))
        .then((rows) => rows[0] ?? null),

    createKeyResult: (
      goalId: string,
      companyId: string,
      data: Omit<typeof goalKeyResults.$inferInsert, "goalId" | "companyId">,
    ) =>
      db
        .insert(goalKeyResults)
        .values({ ...data, goalId, companyId })
        .returning()
        .then((rows) => rows[0]),

    updateKeyResult: (id: string, data: Partial<typeof goalKeyResults.$inferInsert>) =>
      db
        .update(goalKeyResults)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(goalKeyResults.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    removeKeyResult: (id: string) =>
      db
        .delete(goalKeyResults)
        .where(eq(goalKeyResults.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    getProgress: async (goalId: string): Promise<GoalProgress> => {
      const goal = await db
        .select()
        .from(goals)
        .where(eq(goals.id, goalId))
        .then((rows) => rows[0] ?? null);
      if (!goal) {
        return {
          goalId,
          overallProgress: 0,
          keyResultsProgress: 0,
          issueCompletionProgress: 0,
          childGoalsProgress: 0,
          keyResults: [],
        };
      }

      const krs = await db
        .select()
        .from(goalKeyResults)
        .where(eq(goalKeyResults.goalId, goalId));

      const krProgressItems: GoalKeyResultProgress[] = krs.map((kr) => ({
        id: kr.id,
        title: kr.title,
        progress: computeKeyResultProgress(kr.currentValue, kr.startValue, kr.targetValue),
        currentValue: kr.currentValue,
        targetValue: kr.targetValue,
        startValue: kr.startValue,
        unit: kr.unit,
        status: kr.status,
      }));

      const keyResultsProgress = computeWeightedKrProgress(krs, krProgressItems);
      const issueCompletionProgress = await computeIssueProgress(db, goalId);
      const childGoalsProgress = await computeChildGoalsProgress(db, goalId);

      const weight = goal.progressWeight ?? "balanced";
      let overallProgress: number;

      if (weight === "key_results_only") {
        overallProgress = keyResultsProgress;
      } else if (weight === "issues_only") {
        overallProgress = issueCompletionProgress;
      } else {
        overallProgress = Math.round(
          keyResultsProgress * 0.5 +
          issueCompletionProgress * 0.3 +
          childGoalsProgress * 0.2,
        );
      }

      return {
        goalId,
        overallProgress,
        keyResultsProgress,
        issueCompletionProgress,
        childGoalsProgress,
        keyResults: krProgressItems,
      };
    },
  };
}

function computeWeightedKrProgress(
  krs: { weight: number }[],
  items: GoalKeyResultProgress[],
): number {
  if (krs.length === 0) return 0;
  const totalWeight = krs.reduce((sum, kr) => sum + kr.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = krs.reduce(
    (sum, kr, i) => sum + (items[i].progress * kr.weight) / totalWeight,
    0,
  );
  return Math.round(weighted);
}

async function computeIssueProgress(db: Db, goalId: string): Promise<number> {
  const goalIssues = await db
    .select({ status: issues.status })
    .from(issues)
    .where(eq(issues.goalId, goalId));
  if (goalIssues.length === 0) return 0;
  const done = goalIssues.filter(
    (i) => i.status === "done" || i.status === "cancelled",
  ).length;
  return Math.round((done / goalIssues.length) * 100);
}

async function computeChildGoalsProgress(db: Db, goalId: string): Promise<number> {
  const children = await db
    .select({ id: goals.id })
    .from(goals)
    .where(eq(goals.parentId, goalId));
  if (children.length === 0) return 0;

  const childIds = children.map((c) => c.id);
  const childKrs = await db
    .select()
    .from(goalKeyResults)
    .where(inArray(goalKeyResults.goalId, childIds));

  if (childKrs.length === 0) return 0;

  let totalProgress = 0;
  for (const child of children) {
    const krs = childKrs.filter((kr) => kr.goalId === child.id);
    if (krs.length === 0) continue;
    const items = krs.map((kr) => ({
      id: kr.id,
      title: kr.title,
      progress: computeKeyResultProgress(kr.currentValue, kr.startValue, kr.targetValue),
      currentValue: kr.currentValue,
      targetValue: kr.targetValue,
      startValue: kr.startValue,
      unit: kr.unit,
      status: kr.status,
    }));
    totalProgress += computeWeightedKrProgress(krs, items);
  }
  return Math.round(totalProgress / children.length);
}
