CREATE TABLE IF NOT EXISTS "deposits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "amount" numeric NOT NULL,
  "source_address" text,
  "transfer_tx_hash" text,
  "custody_tx_hash" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp DEFAULT now(),
  "completed_at" timestamp
);
