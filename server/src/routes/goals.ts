import { Router } from "express";
import type { Db } from "@stapleai/db";
import {
  createGoalSchema,
  updateGoalSchema,
  createKeyResultSchema,
  updateKeyResultSchema,
} from "@stapleai/shared";
import { validate } from "../middleware/validate.js";
import { goalService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function goalRoutes(db: Db) {
  const router = Router();
  const svc = goalService(db);

  router.get("/companies/:companyId/goals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  router.get("/goals/:id", async (req, res) => {
    const id = req.params.id as string;
    const goal = await svc.getById(id);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    assertCompanyAccess(req, goal.companyId);
    res.json(goal);
  });

  router.post("/companies/:companyId/goals", validate(createGoalSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const goal = await svc.create(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "goal.created",
      entityType: "goal",
      entityId: goal.id,
      details: { title: goal.title },
    });
    res.status(201).json(goal);
  });

  router.patch("/goals/:id", validate(updateGoalSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const goal = await svc.update(id, req.body);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: goal.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "goal.updated",
      entityType: "goal",
      entityId: goal.id,
      details: req.body,
    });

    res.json(goal);
  });

  router.delete("/goals/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const goal = await svc.remove(id);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: goal.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "goal.deleted",
      entityType: "goal",
      entityId: goal.id,
    });

    res.json(goal);
  });

  // --- Progress ---

  router.get("/goals/:id/progress", async (req, res) => {
    const id = req.params.id as string;
    const goal = await svc.getById(id);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    assertCompanyAccess(req, goal.companyId);
    const progress = await svc.getProgress(id);
    res.json(progress);
  });

  // --- Key Results ---

  router.get("/goals/:id/key-results", async (req, res) => {
    const id = req.params.id as string;
    const goal = await svc.getById(id);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    assertCompanyAccess(req, goal.companyId);
    const keyResults = await svc.listKeyResults(id);
    res.json(keyResults);
  });

  router.post(
    "/goals/:id/key-results",
    validate(createKeyResultSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const goal = await svc.getById(id);
      if (!goal) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }
      assertCompanyAccess(req, goal.companyId);
      const kr = await svc.createKeyResult(id, goal.companyId, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: goal.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "goal.key_result.created",
        entityType: "goal",
        entityId: goal.id,
        details: { keyResultId: kr.id, title: kr.title },
      });
      res.status(201).json(kr);
    },
  );

  router.patch("/key-results/:id", validate(updateKeyResultSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getKeyResultById(id);
    if (!existing) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const kr = await svc.updateKeyResult(id, req.body);
    if (!kr) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: kr.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "goal.key_result.updated",
      entityType: "goal",
      entityId: kr.goalId,
      details: { keyResultId: kr.id, ...req.body },
    });
    res.json(kr);
  });

  router.delete("/key-results/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getKeyResultById(id);
    if (!existing) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const kr = await svc.removeKeyResult(id);
    if (!kr) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: kr.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "goal.key_result.deleted",
      entityType: "goal",
      entityId: kr.goalId,
      details: { keyResultId: kr.id },
    });
    res.json(kr);
  });

  return router;
}
