import type { Express, Request, Response } from "express";
import type { Db } from "@paperclipai/db";
import { subscriptions, customers } from "@paperclipai/db";
import { eq, and, desc } from "drizzle-orm";

/**
 * Register subscription management API routes
 */
export function registerSubscriptionRoutes(app: Express, db: Db) {
  // List subscriptions for a customer
  app.get(
    "/api/companies/:companyId/customers/:customerId/subscriptions",
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

        const subscriptionList = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.customerId, customerId))
          .orderBy(desc(subscriptions.createdAt));

        res.json({ subscriptions: subscriptionList });
      } catch (err) {
        console.error("List subscriptions error:", err);
        res.status(500).json({ error: "Failed to list subscriptions" });
      }
    }
  );

  // Get single subscription
  app.get(
    "/api/companies/:companyId/subscriptions/:subscriptionId",
    async (req: Request, res: Response) => {
      try {
        const { companyId, subscriptionId } = req.params as Record<string, string>;

        const [subscription] = await db
          .select({
            subscription: subscriptions,
            customer: customers,
          })
          .from(subscriptions)
          .innerJoin(customers, eq(subscriptions.customerId, customers.id))
          .where(
            and(
              eq(subscriptions.id, subscriptionId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!subscription) {
          return res.status(404).json({ error: "Subscription not found" });
        }

        res.json(subscription);
      } catch (err) {
        console.error("Get subscription error:", err);
        res.status(500).json({ error: "Failed to get subscription" });
      }
    }
  );

  // Create subscription
  app.post(
    "/api/companies/:companyId/customers/:customerId/subscriptions",
    async (req: Request, res: Response) => {
      try {
        const { companyId, customerId } = req.params as Record<string, string>;
        const {
          stripeSubscriptionId,
          stripePriceId,
          status,
          product,
          tier,
          priceCents,
          billingPeriod,
          currentPeriodStart,
          currentPeriodEnd,
          trialStart,
          trialEnd,
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

        if (!status || !product || !tier || priceCents === undefined) {
          return res.status(400).json({
            error: "Missing required fields: status, product, tier, priceCents",
          });
        }

        const [newSubscription] = await db
          .insert(subscriptions)
          .values({
            customerId,
            stripeSubscriptionId: stripeSubscriptionId || null,
            stripePriceId: stripePriceId || null,
            status,
            product,
            tier,
            priceCents,
            billingPeriod: billingPeriod || "monthly",
            currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart) : null,
            currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
            trialStart: trialStart ? new Date(trialStart) : null,
            trialEnd: trialEnd ? new Date(trialEnd) : null,
          })
          .returning();

        // Update customer MRR and subscription info
        const mrrCents = status === "active" ? priceCents : 0;
        await db
          .update(customers)
          .set({
            mrrCents,
            subscriptionTier: tier,
            subscriptionProduct: product,
            status: status === "trialing" ? "trial" : status === "active" ? "active" : customer.status,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customerId));

        res.status(201).json({ subscription: newSubscription });
      } catch (err) {
        console.error("Create subscription error:", err);
        res.status(500).json({ error: "Failed to create subscription" });
      }
    }
  );

  // Update subscription
  app.patch(
    "/api/companies/:companyId/subscriptions/:subscriptionId",
    async (req: Request, res: Response) => {
      try {
        const { companyId, subscriptionId } = req.params as Record<string, string>;
        const updates = req.body;

        // Verify subscription belongs to company
        const [existing] = await db
          .select({
            subscription: subscriptions,
            customer: customers,
          })
          .from(subscriptions)
          .innerJoin(customers, eq(subscriptions.customerId, customers.id))
          .where(
            and(
              eq(subscriptions.id, subscriptionId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: "Subscription not found" });
        }

        const [updated] = await db
          .update(subscriptions)
          .set({
            ...updates,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, subscriptionId))
          .returning();

        // Update customer MRR if status or price changed
        if (updates.status || updates.priceCents !== undefined) {
          const newStatus = updates.status || existing.subscription.status;
          const newPrice = updates.priceCents !== undefined ? updates.priceCents : existing.subscription.priceCents;
          const mrrCents = newStatus === "active" ? newPrice : 0;

          await db
            .update(customers)
            .set({
              mrrCents,
              status: newStatus === "canceled" ? "churned" : existing.customer.status,
              churnedAt: newStatus === "canceled" ? new Date() : existing.customer.churnedAt,
              updatedAt: new Date(),
            })
            .where(eq(customers.id, existing.subscription.customerId));
        }

        res.json({ subscription: updated });
      } catch (err) {
        console.error("Update subscription error:", err);
        res.status(500).json({ error: "Failed to update subscription" });
      }
    }
  );

  // Cancel subscription
  app.post(
    "/api/companies/:companyId/subscriptions/:subscriptionId/cancel",
    async (req: Request, res: Response) => {
      try {
        const { companyId, subscriptionId } = req.params as Record<string, string>;
        const { cancelAtPeriodEnd, churnReason } = req.body;

        // Verify subscription belongs to company
        const [existing] = await db
          .select({
            subscription: subscriptions,
            customer: customers,
          })
          .from(subscriptions)
          .innerJoin(customers, eq(subscriptions.customerId, customers.id))
          .where(
            and(
              eq(subscriptions.id, subscriptionId),
              eq(customers.companyId, companyId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: "Subscription not found" });
        }

        const [updated] = await db
          .update(subscriptions)
          .set({
            cancelAtPeriodEnd: cancelAtPeriodEnd || false,
            canceledAt: new Date(),
            status: cancelAtPeriodEnd ? existing.subscription.status : "canceled",
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, subscriptionId))
          .returning();

        // Update customer if immediately canceled
        if (!cancelAtPeriodEnd) {
          await db
            .update(customers)
            .set({
              status: "churned",
              churnedAt: new Date(),
              churnReason: churnReason || null,
              mrrCents: 0,
              updatedAt: new Date(),
            })
            .where(eq(customers.id, existing.subscription.customerId));
        }

        res.json({ subscription: updated });
      } catch (err) {
        console.error("Cancel subscription error:", err);
        res.status(500).json({ error: "Failed to cancel subscription" });
      }
    }
  );
}
