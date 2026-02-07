import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { PrivyClient } from "@privy-io/node";
import { db } from "@/modules/db";
import { users, tasks, applications } from "@/modules/db/schema";
import { serverData } from "@/modules/general/utils/server-constants";
import { type Address } from "viem";
import { depositAndAllocateForUserTestnet } from "@/modules/yellow/server/funds";
import { createInitialTaskSession } from "@/modules/yellow/server/platform";
import { getYellowUnifiedBalance } from "@/modules/yellow/server/balance";
import { authenticateUser } from "@/modules/users/auth";

const privy = new PrivyClient({
  appId: serverData.environment.PRIVY_APP_ID,
  appSecret: serverData.environment.PRIVY_APP_SECRET,
});

/**
 * Testnet handler: authenticates via Privy token, creates Yellow session
 * using faucet-funded balance. No x402, no on-chain deposit needed.
 */
async function handleCreateTaskTestnet(req: NextRequest, amountUsdc: string): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  let privyUserId: string;
  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    privyUserId = claims.user_id;
  } catch {
    return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.privyUserId, privyUserId))
    .limit(1);

  if (!existingUser || !existingUser.privyWalletId) {
    return NextResponse.json({ error: "User or server wallet not found" }, { status: 400 });
  }

  const user = existingUser;

  let description: string | undefined;
  let tags: string[] = [];
  let deadlineHours: number | undefined;
  let competitionMode = true;
  try {
    const body = await req.json();
    description = body.description;
    tags = Array.isArray(body.tags) ? body.tags : [];
    deadlineHours = body.deadline_hours;
    if (body.competition_mode === false) competitionMode = false;
  } catch {
    // no body is fine
  }

  if (description && description.length > 5000) {
    return NextResponse.json({ error: "Description must be 5000 characters or less" }, { status: 400 });
  }

  // Deposit USDC from user's server wallet into Yellow custody (platform sponsors gas).
  // This enables real withdrawal later — the full custody flow.
  await depositAndAllocateForUserTestnet({
    userId: user.id,
    privyWalletId: user.privyWalletId!,
    walletAddress: user.walletAddress,
    amount: amountUsdc,
  });

  // Create 2-party Yellow session (creator + platform)
  const { appSessionId } = await createInitialTaskSession({
    creatorAddress: user.walletAddress as Address,
    userId: user.id,
    privyWalletId: user.privyWalletId!,
    amount: amountUsdc,
  });

  const deadline = deadlineHours
    ? new Date(Date.now() + deadlineHours * 60 * 60 * 1000)
    : undefined;

  const [task] = await db
    .insert(tasks)
    .values({
      creatorId: user.id,
      amount: amountUsdc,
      status: "open",
      description,
      tags,
      deadline,
      competitionMode,
      appSessionId,
    })
    .returning();

  return NextResponse.json({
    task_id: task.id,
    user_id: user.id,
    wallet_address: user.walletAddress,
  });
}

/**
 * Production handler: creates task from existing Yellow balance.
 * User must deposit first via /api/users/deposit.
 */
async function handleCreateTaskFromBalance(req: NextRequest, amountUsdc: string): Promise<NextResponse> {
  const authResult = await authenticateUser(req);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const user = authResult.user;

  if (!user.privyWalletId) {
    return NextResponse.json(
      { error: "No server wallet configured. Deposit USDC first at /api/users/deposit" },
      { status: 400 },
    );
  }

  // Check Yellow balance
  let yellowBalance: string;
  try {
    yellowBalance = await getYellowUnifiedBalance(user.id, user.privyWalletId, user.walletAddress);
  } catch {
    return NextResponse.json(
      { error: "Could not query Yellow balance" },
      { status: 500 },
    );
  }

  if (parseFloat(yellowBalance) < parseFloat(amountUsdc)) {
    return NextResponse.json(
      {
        error: "Insufficient Yellow balance",
        required: amountUsdc,
        available: yellowBalance,
        deposit_url: "/api/users/deposit",
      },
      { status: 402 },
    );
  }

  let description: string | undefined;
  let tags: string[] = [];
  let deadlineHours: number | undefined;
  let competitionMode = true;
  try {
    const body = await req.json();
    description = body.description;
    tags = Array.isArray(body.tags) ? body.tags : [];
    deadlineHours = body.deadline_hours;
    if (body.competition_mode === false) competitionMode = false;
  } catch {
    // no body or invalid JSON is fine
  }

  if (description && description.length > 5000) {
    return NextResponse.json({ error: "Description must be 5000 characters or less" }, { status: 400 });
  }

  const { appSessionId } = await createInitialTaskSession({
    creatorAddress: user.walletAddress as Address,
    userId: user.id,
    privyWalletId: user.privyWalletId,
    amount: amountUsdc,
  });

  const deadline = deadlineHours
    ? new Date(Date.now() + deadlineHours * 60 * 60 * 1000)
    : undefined;

  const [task] = await db
    .insert(tasks)
    .values({
      creatorId: user.id,
      amount: amountUsdc,
      status: "open",
      description,
      tags,
      deadline,
      competitionMode,
      appSessionId,
    })
    .returning();

  return NextResponse.json({
    task_id: task.id,
    user_id: user.id,
    wallet_address: user.walletAddress,
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const creatorId = url.searchParams.get("creator");
  const acceptorId = url.searchParams.get("acceptor");

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(tasks.status, status));
  if (creatorId) conditions.push(eq(tasks.creatorId, creatorId));
  if (acceptorId) conditions.push(eq(tasks.acceptorId, acceptorId));

  const results = conditions.length > 0
    ? await db.select().from(tasks).where(and(...conditions))
    : await db.select().from(tasks);

  // Enrich with participant wallet addresses
  const participantIds = new Set<string>();
  for (const t of results) {
    participantIds.add(t.creatorId);
    if (t.acceptorId) participantIds.add(t.acceptorId);
  }

  const participantMap: Record<string, {
    walletAddress: string;
    username: string | null;
    ensName: string | null;
    baseName: string | null;
    activeIdentity: string | null;
  }> = {};
  if (participantIds.size > 0) {
    const { or } = await import("drizzle-orm");
    const participants = await db
      .select({
        id: users.id,
        walletAddress: users.walletAddress,
        username: users.username,
        ensName: users.ensName,
        baseName: users.baseName,
        activeIdentity: users.activeIdentity,
      })
      .from(users)
      .where(or(...[...participantIds].map((pid) => eq(users.id, pid))));
    for (const p of participants) {
      participantMap[p.id] = {
        walletAddress: p.walletAddress,
        username: p.username,
        ensName: p.ensName,
        baseName: p.baseName,
        activeIdentity: p.activeIdentity,
      };
    }
  }

  // Count applications per task
  const taskIds = results.map((t) => t.id);
  const appCountMap: Record<string, number> = {};
  if (taskIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const counts = await db
      .select({
        taskId: applications.taskId,
        count: sql<number>`count(*)::int`,
      })
      .from(applications)
      .where(inArray(applications.taskId, taskIds))
      .groupBy(applications.taskId);
    for (const c of counts) {
      appCountMap[c.taskId] = c.count;
    }
  }

  const enriched = results.map((t) => ({
    ...t,
    creatorWallet: participantMap[t.creatorId]?.walletAddress || null,
    acceptorWallet: t.acceptorId ? participantMap[t.acceptorId]?.walletAddress || null : null,
    applicationCount: appCountMap[t.id] || 0,
    creator: participantMap[t.creatorId] ? {
      username: participantMap[t.creatorId].username,
      ens_name: participantMap[t.creatorId].ensName,
      base_name: participantMap[t.creatorId].baseName,
      active_identity: participantMap[t.creatorId].activeIdentity,
      wallet_address: participantMap[t.creatorId].walletAddress,
    } : null,
  }));

  return NextResponse.json({ tasks: enriched });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const amount = url.searchParams.get("amount") || "0.01";

  // Testnet: simple Privy auth, server wallet handles everything
  if (serverData.isTestnet) {
    return handleCreateTaskTestnet(req, amount);
  }

  // Production: draw from existing Yellow balance (deposit via /api/users/deposit first)
  return handleCreateTaskFromBalance(req, amount);
}
