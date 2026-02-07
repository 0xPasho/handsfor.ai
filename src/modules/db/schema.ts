import { boolean, json, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: text("wallet_address").notNull().unique(),
  privyWalletId: text("privy_wallet_id"),
  privyUserId: text("privy_user_id"),
  externalWalletAddress: text("external_wallet_address"),
  apiKey: text("api_key").notNull().unique(),
  balance: numeric("balance").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  displayName: text("display_name"),
  bio: text("bio"),
  location: text("location"),
  tags: json("tags").$type<string[]>().default([]),
  avatarUrl: text("avatar_url"),
  twitterHandle: text("twitter_handle"),
  githubHandle: text("github_handle"),
  websiteUrl: text("website_url"),
  hourlyRate: numeric("hourly_rate"),
  username: text("username").unique(),
  ensName: text("ens_name"),
  ensAvatar: text("ens_avatar"),
  baseName: text("base_name"),
  baseAvatar: text("base_avatar"),
  activeIdentity: text("active_identity").default("username"),
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
  tags: json("tags").$type<string[]>().default([]),
  deadline: timestamp("deadline"),
  competitionMode: boolean("competition_mode").notNull().default(true),
  winnerSubmissionId: uuid("winner_submission_id"),
  evidenceNotes: text("evidence_notes"),
  disputeReason: text("dispute_reason"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  submittedAt: timestamp("submitted_at"),
  completedAt: timestamp("completed_at"),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id),
  workerId: text("worker_id").notNull(),
  workerWallet: text("worker_wallet").notNull(),
  evidenceNotes: text("evidence_notes"),
  attachmentUrl: text("attachment_url"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  isWinner: boolean("is_winner").notNull().default(false),
});

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id),
  applicantId: uuid("applicant_id")
    .notNull()
    .references(() => users.id),
  applicantWallet: text("applicant_wallet").notNull(),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id),
  participantId: uuid("participant_id")
    .notNull()
    .references(() => users.id),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => users.id),
  revieweeId: uuid("reviewee_id")
    .notNull()
    .references(() => users.id),
  rating: numeric("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const withdrawals = pgTable("withdrawals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  amount: numeric("amount").notNull(),
  destinationAddress: text("destination_address").notNull(),
  custodyTxHash: text("custody_tx_hash"),
  transferTxHash: text("transfer_tx_hash"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const deposits = pgTable("deposits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  amount: numeric("amount").notNull(),
  sourceAddress: text("source_address"),
  transferTxHash: text("transfer_tx_hash"),
  custodyTxHash: text("custody_tx_hash"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
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
