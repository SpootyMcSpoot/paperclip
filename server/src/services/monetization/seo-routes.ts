import type { Express, Request, Response } from "express";
import type { Db } from "@paperclipai/db";
import { seoProjects, customers } from "@paperclipai/db";
import { eq, and, desc } from "drizzle-orm";

/**
 * Register SEO project API routes
 */
export function registerSeoRoutes(app: Express, db: Db) {
  // List SEO projects for a customer
  app.get(
    "/api/companies/:companyId/customers/:customerId/seo/projects",
    async (req: Request, res: Response) => {
      try {
        const { companyId, customerId } = req.params as Record<string, string>;

        // Verify customer belongs to company
        const [customer] = await db
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.id, customerId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!customer) {
          return res.status(404).json({ error: "Customer not found" });
        }

        const projects = await db
          .select()
          .from(seoProjects)
          .where(eq(seoProjects.customerId, customerId))
          .orderBy(desc(seoProjects.createdAt));

        res.json({ projects });
      } catch (err) {
        console.error("List SEO projects error:", err);
        res.status(500).json({ error: "Failed to list SEO projects" });
      }
    }
  );

  // Get single SEO project
  app.get(
    "/api/companies/:companyId/seo/projects/:projectId",
    async (req: Request, res: Response) => {
      try {
        const { companyId, projectId } = req.params as Record<string, string>;

        const [project] = await db
          .select({
            project: seoProjects,
            customer: customers,
          })
          .from(seoProjects)
          .innerJoin(customers, eq(seoProjects.customerId, customers.id))
          .where(
            and(
              eq(seoProjects.id, projectId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!project) {
          return res.status(404).json({ error: "SEO project not found" });
        }

        // Parse JSON fields
        const projectData = {
          ...project.project,
          keywords: project.project.keywords ? JSON.parse(project.project.keywords) : [],
          keywordRankings: project.project.keywordRankings
            ? JSON.parse(project.project.keywordRankings)
            : {},
          recommendations: project.project.recommendations
            ? JSON.parse(project.project.recommendations)
            : [],
        };

        res.json({ project: projectData, customer: project.customer });
      } catch (err) {
        console.error("Get SEO project error:", err);
        res.status(500).json({ error: "Failed to get SEO project" });
      }
    }
  );

  // Create SEO project
  app.post(
    "/api/companies/:companyId/customers/:customerId/seo/projects",
    async (req: Request, res: Response) => {
      try {
        const { companyId, customerId } = req.params as Record<string, string>;
        const {
          domain,
          keywords,
          auditSchedule,
          agentId,
        } = req.body;

        // Verify customer belongs to company
        const [customer] = await db
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.id, customerId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!customer) {
          return res.status(404).json({ error: "Customer not found" });
        }

        if (!domain) {
          return res.status(400).json({ error: "Domain is required" });
        }

        const [newProject] = await db
          .insert(seoProjects)
          .values({
            customerId,
            agentId: agentId || null,
            domain,
            keywords: keywords ? JSON.stringify(keywords) : null,
            auditSchedule: auditSchedule || "weekly",
          })
          .returning();

        res.status(201).json({ project: newProject });
      } catch (err) {
        console.error("Create SEO project error:", err);
        res.status(500).json({ error: "Failed to create SEO project" });
      }
    }
  );

  // Update SEO project
  app.patch(
    "/api/companies/:companyId/seo/projects/:projectId",
    async (req: Request, res: Response) => {
      try {
        const { companyId, projectId } = req.params as Record<string, string>;
        const updates = req.body;

        // Verify project belongs to company
        const [existing] = await db
          .select({
            project: seoProjects,
            customer: customers,
          })
          .from(seoProjects)
          .innerJoin(customers, eq(seoProjects.customerId, customers.id))
          .where(
            and(
              eq(seoProjects.id, projectId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: "SEO project not found" });
        }

        const [updated] = await db
          .update(seoProjects)
          .set({
            ...updates,
            updatedAt: new Date(),
          })
          .where(eq(seoProjects.id, projectId))
          .returning();

        res.json({ project: updated });
      } catch (err) {
        console.error("Update SEO project error:", err);
        res.status(500).json({ error: "Failed to update SEO project" });
      }
    }
  );

  // Run SEO audit
  app.post(
    "/api/companies/:companyId/seo/projects/:projectId/audit",
    async (req: Request, res: Response) => {
      try {
        const { companyId, projectId } = req.params as Record<string, string>;

        // Verify project belongs to company
        const [existing] = await db
          .select({
            project: seoProjects,
            customer: customers,
          })
          .from(seoProjects)
          .innerJoin(customers, eq(seoProjects.customerId, customers.id))
          .where(
            and(
              eq(seoProjects.id, projectId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: "SEO project not found" });
        }

        // TODO: Trigger actual audit via Visiblai service
        // This would call the Visiblai API to run a comprehensive audit

        // Update audit timestamps
        const now = new Date();
        const nextAudit = new Date(now);
        switch (existing.project.auditSchedule) {
          case "daily":
            nextAudit.setDate(nextAudit.getDate() + 1);
            break;
          case "weekly":
            nextAudit.setDate(nextAudit.getDate() + 7);
            break;
          case "monthly":
            nextAudit.setMonth(nextAudit.getMonth() + 1);
            break;
        }

        const [updated] = await db
          .update(seoProjects)
          .set({
            lastAuditAt: now,
            nextAuditAt: nextAudit,
            updatedAt: now,
          })
          .where(eq(seoProjects.id, projectId))
          .returning();

        res.json({
          project: updated,
          message: "Audit initiated",
        });
      } catch (err) {
        console.error("Run SEO audit error:", err);
        res.status(500).json({ error: "Failed to run SEO audit" });
      }
    }
  );

  // Get SEO project health report
  app.get(
    "/api/companies/:companyId/seo/projects/:projectId/health",
    async (req: Request, res: Response) => {
      try {
        const { companyId, projectId } = req.params as Record<string, string>;

        const [result] = await db
          .select({
            project: seoProjects,
            customer: customers,
          })
          .from(seoProjects)
          .innerJoin(customers, eq(seoProjects.customerId, customers.id))
          .where(
            and(
              eq(seoProjects.id, projectId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!result) {
          return res.status(404).json({ error: "SEO project not found" });
        }

        const { project } = result;

        res.json({
          projectId: project.id,
          domain: project.domain,
          healthScore: project.healthScore,
          technicalIssues: project.technicalIssues,
          contentIssues: project.contentIssues,
          backlinkCount: project.backlinkCount,
          organicTraffic: project.organicTraffic,
          lastAuditAt: project.lastAuditAt,
          nextAuditAt: project.nextAuditAt,
          keywordRankings: project.keywordRankings
            ? JSON.parse(project.keywordRankings)
            : {},
          recommendations: project.recommendations
            ? JSON.parse(project.recommendations)
            : [],
        });
      } catch (err) {
        console.error("Get SEO health error:", err);
        res.status(500).json({ error: "Failed to get SEO health report" });
      }
    }
  );

  // Delete SEO project
  app.delete(
    "/api/companies/:companyId/seo/projects/:projectId",
    async (req: Request, res: Response) => {
      try {
        const { companyId, projectId } = req.params as Record<string, string>;

        // Verify project belongs to company
        const [existing] = await db
          .select({
            project: seoProjects,
            customer: customers,
          })
          .from(seoProjects)
          .innerJoin(customers, eq(seoProjects.customerId, customers.id))
          .where(
            and(
              eq(seoProjects.id, projectId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: "SEO project not found" });
        }

        await db
          .delete(seoProjects)
          .where(eq(seoProjects.id, projectId));

        res.json({ success: true });
      } catch (err) {
        console.error("Delete SEO project error:", err);
        res.status(500).json({ error: "Failed to delete SEO project" });
      }
    }
  );
}
