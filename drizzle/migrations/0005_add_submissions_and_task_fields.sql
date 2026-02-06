-- Create submissions table
CREATE TABLE IF NOT EXISTS "submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "worker_id" text NOT NULL,
  "worker_wallet" text NOT NULL,
  "evidence_notes" text,
  "attachment_url" text,
  "submitted_at" timestamp DEFAULT now(),
  "is_winner" boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Add new columns to tasks table
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "category" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deadline" timestamp;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "competition_mode" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "winner_submission_id" uuid;
