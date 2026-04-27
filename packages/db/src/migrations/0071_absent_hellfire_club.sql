CREATE TABLE "goal_key_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"metric_type" text DEFAULT 'number' NOT NULL,
	"target_value" text NOT NULL,
	"current_value" text DEFAULT '0' NOT NULL,
	"start_value" text DEFAULT '0' NOT NULL,
	"unit" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "progress_weight" text DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_key_results" ADD CONSTRAINT "goal_key_results_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_key_results" ADD CONSTRAINT "goal_key_results_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_key_results_goal_idx" ON "goal_key_results" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_key_results_company_idx" ON "goal_key_results" USING btree ("company_id");
