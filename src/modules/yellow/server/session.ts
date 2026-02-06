"use server";

import { eq, and } from "drizzle-orm";
import { type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { db } from "../../db";
import { yellowSessions } from "../../db/schema";

import { createYellowConnection, yellowTransfer, yellowDisconnect } from "./client";
import { listUserChannels } from "./channel";

const DEFAULT_SESSION_DURATION_HOURS = 24;

type CreateSessionResult = {
  success: boolean;
  sessionId?: string;
  channelId?: string;
  error?: string;
};

/**
 * Create a Yellow Network session.
 *
 * Connects to Yellow WS with the session key (ECDSA auth),
 * creates/finds a channel, and stores the session in DB.
 */
export async function createYellowSession(params: {
  userId: string;
  sessionPrivateKey: string;
  walletAddress: string;
  allowance: string;
  durationHours?: number;
}): Promise<CreateSessionResult> {
  const durationHours = params.durationHours || DEFAULT_SESSION_DURATION_HOURS;
  const durationSeconds = durationHours * 60 * 60;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000);

  const sessionKeyAccount = privateKeyToAccount(params.sessionPrivateKey as Hex);
  const sessionKeyAddress = sessionKeyAccount.address;

  const conn = await createYellowConnection(
    params.sessionPrivateKey,
    params.walletAddress,
    params.allowance,
    durationSeconds,
  );

  let channelId: string | undefined;

  try {
    const channels = await listUserChannels(conn);

    if (channels.length > 0) {
      channelId = channels[0].channelId;
    } else {
      // Channels are created during the deposit flow (depositAndAllocateForUser/Testnet).
      // If no channel exists here, the deposit flow hasn't run yet.
      console.warn(`[Session] No channels found for ${params.walletAddress}. Channel creation requires the deposit flow.`);
    }
  } finally {
    await yellowDisconnect(conn);
  }

  const [inserted] = await db
    .insert(yellowSessions)
    .values({
      userId: params.userId,
      sessionKeyAddress,
      sessionPrivateKey: params.sessionPrivateKey,
      walletAddress: params.walletAddress,
      channelId: channelId ?? null,
      allowance: params.allowance,
      expiresAt,
    })
    .returning({ id: yellowSessions.id });

  return {
    success: true,
    sessionId: inserted.id,
    channelId,
  };
}

/**
 * Get the user's active Yellow session, if any.
 */
export async function getActiveYellowSession(userId: string) {
  const [session] = await db
    .select()
    .from(yellowSessions)
    .where(and(eq(yellowSessions.userId, userId), eq(yellowSessions.status, "active")))
    .limit(1);

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

/**
 * Execute an off-chain transfer via the user's active Yellow session.
 */
export async function executeYellowTransfer(
  userId: string,
  destinationAddress: string,
  amount: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getActiveYellowSession(userId);
  if (!session) {
    return { success: false, error: "No active Yellow session" };
  }

  const conn = await createYellowConnection(
    session.sessionPrivateKey,
    session.walletAddress,
    session.allowance ?? "0",
  );

  try {
    return await yellowTransfer(conn, destinationAddress, amount);
  } finally {
    await yellowDisconnect(conn);
  }
}
