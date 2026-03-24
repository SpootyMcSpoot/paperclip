import type { Express, Request, Response } from "express";
import type { Db } from "@stapleai/db";
import { customers, subscriptions } from "@stapleai/db";
import { eq, and, desc } from "drizzle-orm";

/**
 * Register customer management API routes
 *
 * All routes require authentication and company context
 */
export function registerCustomerRoutes(app: Express, db: Db) {
  // List customers for a company
  app.get("/api/companies/:companyId/customers", async (req: Request, res: Response) => {
    try {
      const { companyId } = req.params as Record<string, string>;

      const customerList = await db
        .select()
        .from(customers)
        .where(eq(customers.companyId, companyId))
        .orderBy(desc(customers.createdAt));

      res.json({ customers: customerList });
    } catch (err) {
      console.error("List customers error:", err);
      res.status(500).json({ error: "Failed to list customers" });
    }
  });

  // Get single customer
  app.get("/api/companies/:companyId/customers/:customerId", async (req: Request, res: Response) => {
    try {
      const { companyId, customerId } = req.params as Record<string, string>;

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

      // Get customer's subscriptions
      const customerSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.customerId, customerId))
        .orderBy(desc(subscriptions.createdAt));

      res.json({
        customer,
        subscriptions: customerSubscriptions,
      });
    } catch (err) {
      console.error("Get customer error:", err);
      res.status(500).json({ error: "Failed to get customer" });
    }
  });

  // Create customer
  app.post("/api/companies/:companyId/customers", async (req: Request, res: Response) => {
    try {
      const { companyId } = req.params as Record<string, string>;
      const {
        email,
        name,
        stripeCustomerId,
        subscriptionTier,
        subscriptionProduct,
        trialEndsAt,
        metadata,
      } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const [newCustomer] = await db
        .insert(customers)
        .values({
          companyId,
          email,
          name: name || null,
          stripeCustomerId: stripeCustomerId || null,
          subscriptionTier: subscriptionTier || null,
          subscriptionProduct: subscriptionProduct || null,
          status: "trial",
          trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
          metadata: metadata ? JSON.stringify(metadata) : null,
        })
        .returning();

      res.status(201).json({ customer: newCustomer });
    } catch (err) {
      console.error("Create customer error:", err);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  // Update customer
  app.patch("/api/companies/:companyId/customers/:customerId", async (req: Request, res: Response) => {
    try {
      const { companyId, customerId } = req.params as Record<string, string>;
      const updates = req.body;

      // Check customer exists and belongs to company
      const [existing] = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.id, customerId),
            eq(customers.companyId, companyId)
          )
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const [updated] = await db
        .update(customers)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customerId))
        .returning();

      res.json({ customer: updated });
    } catch (err) {
      console.error("Update customer error:", err);
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  // Delete customer
  app.delete("/api/companies/:companyId/customers/:customerId", async (req: Request, res: Response) => {
    try {
      const { companyId, customerId } = req.params as Record<string, string>;

      // Check customer exists and belongs to company
      const [existing] = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.id, customerId),
            eq(customers.companyId, companyId)
          )
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Customer not found" });
      }

      await db
        .delete(customers)
        .where(eq(customers.id, customerId));

      res.json({ success: true });
    } catch (err) {
      console.error("Delete customer error:", err);
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });
}
