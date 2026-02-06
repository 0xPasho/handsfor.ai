CREATE TABLE IF NOT EXISTS "applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id"),
  "applicant_id" uuid NOT NULL REFERENCES "users"("id"),
  "applicant_wallet" text NOT NULL,
  "message" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "reviewed_at" timestamp
);
