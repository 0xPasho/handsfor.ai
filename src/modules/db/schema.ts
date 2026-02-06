import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: text("wallet_address").notNull().unique(),
  privyWalletId: text("privy_wallet_id"),
  privyUserId: text("privy_user_id"),
  externalWalletAddress: text("external_wallet_address"),
  apiKey: text("api_key").notNull().unique(),
  balance: numeric("balance").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  acceptorId: uuid("acceptor_id").references(() => users.id),
  appSessionId: text("app_session_id"),
  amount: numeric("amount").notNull(),
  status: text("status").notNull().default("open"),
  description: text("description"),
  evidenceNotes: text("evidence_notes"),
  disputeReason: text("dispute_reason"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  submittedAt: timestamp("submitted_at"),
  completedAt: timestamp("completed_at"),
});

export const yellowSessions = pgTable("yellow_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  sessionKeyAddress: text("session_key_address").notNull(),
  sessionPrivateKey: text("session_private_key").notNull(),
  walletAddress: text("wallet_address").notNull(),
  channelId: text("channel_id"),
  allowance: numeric("allowance").notNull(),
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
