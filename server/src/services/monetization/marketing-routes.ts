import type { Express, Request, Response } from "express";
import type { Db } from "@stapleai/db";
import { marketingCampaigns } from "@stapleai/db";
import { eq, and, desc } from "drizzle-orm";

/**
 * Register marketing campaign API routes
 */
export function registerMarketingRoutes(app: Express, db: Db) {
  // List marketing campaigns for a company
  app.get("/api/companies/:companyId/marketing/campaigns", async (req: Request, res: Response) => {
    try {
      const { companyId } = req.params as Record<string, string>;
      const { status, agentId } = req.query;

      let query = db
        .select()
        .from(marketingCampaigns)
        .where(eq(marketingCampaigns.companyId, companyId))
        .$dynamic();

      if (status) {
        query = query.where(eq(marketingCampaigns.status, status as string));
      }

      if (agentId) {
        query = query.where(eq(marketingCampaigns.agentId, agentId as string));
      }

      const campaigns = await query.orderBy(desc(marketingCampaigns.createdAt));

      res.json({ campaigns });
    } catch (err) {
      console.error("List campaigns error:", err);
      res.status(500).json({ error: "Failed to list campaigns" });
    }
  });

  // Get single campaign
  app.get(
    "/api/companies/:companyId/marketing/campaigns/:campaignId",
    async (req: Request, res: Response) => {
      try {
        const { companyId, campaignId } = req.params as Record<string, string>;

        const [campaign] = await db
          .select()
          .from(marketingCampaigns)
          .where(
            and(
              eq(marketingCampaigns.id, campaignId),
              eq(marketingCampaigns.companyId, companyId)
            )
          )
          .limit(1);

        if (!campaign) {
          return res.status(404).json({ error: "Campaign not found" });
        }

        res.json({ campaign });
      } catch (err) {
        console.error("Get campaign error:", err);
        res.status(500).json({ error: "Failed to get campaign" });
      }
    }
  );

  // Create campaign
  app.post("/api/companies/:companyId/marketing/campaigns", async (req: Request, res: Response) => {
    try {
      const { companyId } = req.params as Record<string, string>;
      const {
        name,
        agentId,
        productSlug,
        platforms,
        content,
        scheduledFor,
        externalDraftId,
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Campaign name is required" });
      }

      const [newCampaign] = await db
        .insert(marketingCampaigns)
        .values({
          companyId,
          agentId: agentId || null,
          name,
          productSlug: productSlug || null,
          status: "draft",
          platforms: platforms ? JSON.stringify(platforms) : null,
          content: content || null,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
          externalDraftId: externalDraftId || null,
        })
        .returning();

      res.status(201).json({ campaign: newCampaign });
    } catch (err) {
      console.error("Create campaign error:", err);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  // Update campaign
  app.patch(
    "/api/companies/:companyId/marketing/campaigns/:campaignId",
    async (req: Request, res: Response) => {
      try {
        const { companyId, campaignId } = req.params as Record<string, string>;
        const updates = req.body;

        // Check campaign exists and belongs to company
        const [existing] = await db
          .select()
          .from(marketingCampaigns)
          .where(
            and(
              eq(marketingCampaigns.id, campaignId),
              eq(marketingCampaigns.companyId, companyId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: "Campaign not found" });
        }

        const [updated] = await db
          .update(marketingCampaigns)
          .set({
            ...updates,
            updatedAt: new Date(),
          })
          .where(eq(marketingCampaigns.id, campaignId))
          .returning();

        res.json({ campaign: updated });
      } catch (err) {
        console.error("Update campaign error:", err);
        res.status(500).json({ error: "Failed to update campaign" });
      }
    }
  );

  // Publish campaign
  app.post(
    "/api/companies/:companyId/marketing/campaigns/:campaignId/publish",
    async (req: Request, res: Response) => {
      try {
        const { companyId, campaignId } = req.params as Record<string, string>;

        const [existing] = await db
          .select()
          .from(marketingCampaigns)
          .where(
            and(
              eq(marketingCampaigns.id, campaignId),
              eq(marketingCampaigns.companyId, companyId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: "Campaign not found" });
        }

        if (existing.status !== "draft" && existing.status !== "scheduled") {
          return res.status(400).json({
            error: "Only draft or scheduled campaigns can be published",
          });
        }

        const [updated] = await db
          .update(marketingCampaigns)
          .set({
            status: "publishing",
            updatedAt: new Date(),
          })
          .where(eq(marketingCampaigns.id, campaignId))
          .returning();

        // TODO: Trigger actual publishing to external marketing service
        // This would call marketing-api.spooty.io to publish the campaign

        res.json({ campaign: updated });
      } catch (err) {
        console.error("Publish campaign error:", err);
        res.status(500).json({ error: "Failed to publish campaign" });
      }
    }
  );

  // Delete campaign
  app.delete(
    "/api/companies/:companyId/marketing/campaigns/:campaignId",
    async (req: Request, res: Response) => {
      try {
        const { companyId, campaignId } = req.params as Record<string, string>;

        const [existing] = await db
          .select()
          .from(marketingCampaigns)
          .where(
            and(
              eq(marketingCampaigns.id, campaignId),
              eq(marketingCampaigns.companyId, companyId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: "Campaign not found" });
        }

        await db
          .delete(marketingCampaigns)
          .where(eq(marketingCampaigns.id, campaignId));

        res.json({ success: true });
      } catch (err) {
        console.error("Delete campaign error:", err);
        res.status(500).json({ error: "Failed to delete campaign" });
      }
    }
  );

  // Get campaign analytics/performance metrics
  app.get(
    "/api/companies/:companyId/marketing/campaigns/:campaignId/analytics",
    async (req: Request, res: Response) => {
      try {
        const { companyId, campaignId } = req.params as Record<string, string>;

        const [campaign] = await db
          .select()
          .from(marketingCampaigns)
          .where(
            and(
              eq(marketingCampaigns.id, campaignId),
              eq(marketingCampaigns.companyId, companyId)
            )
          )
          .limit(1);

        if (!campaign) {
          return res.status(404).json({ error: "Campaign not found" });
        }

        // Parse performance metrics from JSON
        const metrics = campaign.performanceMetrics
          ? JSON.parse(campaign.performanceMetrics)
          : null;

        res.json({
          campaignId: campaign.id,
          name: campaign.name,
          status: campaign.status,
          publishedAt: campaign.publishedAt,
          metrics,
        });
      } catch (err) {
        console.error("Get campaign analytics error:", err);
        res.status(500).json({ error: "Failed to get campaign analytics" });
      }
    }
  );
}
