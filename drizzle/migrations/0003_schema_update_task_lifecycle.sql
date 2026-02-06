-- Add new columns to users table
ALTER TABLE "users" ADD COLUMN "privy_wallet_id" text;
ALTER TABLE "users" ADD COLUMN "privy_user_id" text;

-- Rename tasks columns: user_id -> creator_id, amount_locked -> amount
ALTER TABLE "tasks" RENAME COLUMN "user_id" TO "creator_id";
ALTER TABLE "tasks" RENAME COLUMN "amount_locked" TO "amount";

-- Update foreign key constraint for renamed column
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_user_id_users_id_fk";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- Add new columns to tasks table
ALTER TABLE "tasks" ADD COLUMN "acceptor_id" uuid REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tasks" ADD COLUMN "app_session_id" text;
ALTER TABLE "tasks" ADD COLUMN "description" text;
ALTER TABLE "tasks" ADD COLUMN "evidence_notes" text;
ALTER TABLE "tasks" ADD COLUMN "dispute_reason" text;
ALTER TABLE "tasks" ADD COLUMN "resolution" text;
ALTER TABLE "tasks" ADD COLUMN "accepted_at" timestamp;
ALTER TABLE "tasks" ADD COLUMN "submitted_at" timestamp;
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp;

-- Update existing task statuses from 'pending' to 'open' (new default)
UPDATE "tasks" SET "status" = 'open' WHERE "status" = 'pending';
