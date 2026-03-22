CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"stripe_customer_id" text,
	"subscription_tier" text,
	"subscription_product" text,
	"mrr_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"churned_at" timestamp with time zone,
	"churn_reason" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"status" text NOT NULL,
	"product" text NOT NULL,
	"tier" text NOT NULL,
	"price_cents" integer NOT NULL,
	"billing_period" text DEFAULT 'monthly' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"trial_start" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"name" text NOT NULL,
	"product_slug" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"platforms" text,
	"content" text,
	"published_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"performance_metrics" text,
	"external_draft_id" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"agent_id" uuid,
	"domain" text NOT NULL,
	"keywords" text,
	"audit_schedule" text DEFAULT 'weekly' NOT NULL,
	"last_audit_at" timestamp with time zone,
	"next_audit_at" timestamp with time zone,
	"health_score" integer,
	"technical_issues" integer DEFAULT 0 NOT NULL,
	"content_issues" integer DEFAULT 0 NOT NULL,
	"backlink_count" integer DEFAULT 0 NOT NULL,
	"organic_traffic" integer,
	"keyword_rankings" text,
	"recommendations" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "seo_projects" ADD CONSTRAINT "seo_projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "seo_projects" ADD CONSTRAINT "seo_projects_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "customers_company_idx" ON "customers" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "customers_stripe_idx" ON "customers" USING btree ("stripe_customer_id");
--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "marketing_campaigns_company_idx" ON "marketing_campaigns" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "marketing_campaigns_agent_idx" ON "marketing_campaigns" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX "marketing_campaigns_status_idx" ON "marketing_campaigns" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "seo_projects_customer_idx" ON "seo_projects" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX "seo_projects_domain_idx" ON "seo_projects" USING btree ("domain");
