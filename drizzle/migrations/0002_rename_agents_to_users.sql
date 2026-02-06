-- Drop old unused tables from biometric auth
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "credentials" CASCADE;
DROP TABLE IF EXISTS "challenges" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- Rename agents table to users
ALTER TABLE "agents" RENAME TO "users";

-- Rename constraints
ALTER TABLE "users" RENAME CONSTRAINT "agents_wallet_address_unique" TO "users_wallet_address_unique";
ALTER TABLE "users" RENAME CONSTRAINT "agents_api_key_unique" TO "users_api_key_unique";

-- Rename column in tasks table
ALTER TABLE "tasks" RENAME COLUMN "agent_id" TO "user_id";

-- Update foreign key constraint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_agent_id_agents_id_fk";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- Update yellow_sessions foreign key to reference new users table
ALTER TABLE "yellow_sessions" DROP CONSTRAINT IF EXISTS "yellow_sessions_user_id_users_id_fk";
ALTER TABLE "yellow_sessions" ADD CONSTRAINT "yellow_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
