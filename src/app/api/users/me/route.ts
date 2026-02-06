import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { eq, or } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/modules/db";
import { users, tasks } from "@/modules/db/schema";
import { serverData } from "@/modules/general/utils/server-constants";
import { getUsdcBalance } from "@/modules/evm/balance";
import { getYellowUnifiedBalance } from "@/modules/yellow/server/balance";
import { authenticateUser } from "@/modules/users/auth";

const privy = new PrivyClient({
  appId: serverData.environment.PRIVY_APP_ID,
  appSecret: serverData.environment.PRIVY_APP_SECRET,
});

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  // Check if user already exists by privyUserId
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.privyUserId, privyUserId))
    .limit(1);

  let user = existingUser;
  let isNewUser = false;

  if (!user) {
    // Create an app-owned server wallet (owned by our signing key)
    const authPublicKey = serverData.environment.PRIVY_AUTHORIZATION_PUBLIC_KEY;
    const wallet = await privy.wallets().create({
      chain_type: "ethereum",
      owner: { public_key: authPublicKey },
    });

    const apiKey = `sk_${randomBytes(32).toString("hex")}`;
    const [inserted] = await db
      .insert(users)
      .values({
        walletAddress: wallet.address,
        privyWalletId: wallet.id,
        privyUserId,
        apiKey,
        balance: "0",
      })
      .returning();
    user = inserted;
    isNewUser = true;
  }

  // Get all tasks where user is creator OR acceptor
  const userTasks = await db
    .select()
    .from(tasks)
    .where(or(eq(tasks.creatorId, user.id), eq(tasks.acceptorId, user.id)));

  // Collect unique user IDs from tasks to batch-fetch wallet addresses
  const participantIds = new Set<string>();
  for (const t of userTasks) {
    participantIds.add(t.creatorId);
    if (t.acceptorId) participantIds.add(t.acceptorId);
  }

  const walletMap: Record<string, string> = {};
  if (participantIds.size > 0) {
    const participants = await db
      .select({ id: users.id, walletAddress: users.walletAddress })
      .from(users)
      .where(or(...[...participantIds].map((pid) => eq(users.id, pid))));
    for (const p of participants) {
      walletMap[p.id] = p.walletAddress;
    }
  }

  const enrichedTasks = userTasks.map((t) => ({
    ...t,
    creatorWallet: walletMap[t.creatorId] || null,
    acceptorWallet: t.acceptorId ? walletMap[t.acceptorId] || null : null,
  }));

  // Fetch on-chain USDC balance and Yellow balance in parallel
  const [onChainBalance, yellowBalance] = await Promise.all([
    getUsdcBalance(user.walletAddress),
    user.privyWalletId
      ? getYellowUnifiedBalance(user.id, user.privyWalletId, user.walletAddress)
      : Promise.resolve("0"),
  ]);

  return NextResponse.json({
    user_id: user.id,
    wallet_address: user.walletAddress,
    privy_wallet_id: user.privyWalletId,
    balance: onChainBalance,
    yellow_balance: yellowBalance,
    api_key: user.apiKey,
    is_new: isNewUser,
    tasks: enrichedTasks,
    display_name: user.displayName || null,
    bio: user.bio || null,
    location: user.location || null,
    tags: user.tags || [],
    avatar_url: user.avatarUrl || null,
    twitter_handle: user.twitterHandle || null,
    github_handle: user.githubHandle || null,
    website_url: user.websiteUrl || null,
    hourly_rate: user.hourlyRate || null,
  });
}

const PROFILE_FIELDS: Record<string, string> = {
  display_name: "displayName",
  bio: "bio",
  location: "location",
  tags: "tags",
  avatar_url: "avatarUrl",
  twitter_handle: "twitterHandle",
  github_handle: "githubHandle",
  website_url: "websiteUrl",
  hourly_rate: "hourlyRate",
};

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateUser(req);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [apiField, dbField] of Object.entries(PROFILE_FIELDS)) {
    if (apiField in body) {
      updates[dbField] = body[apiField];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Validation
  if (updates.displayName !== undefined && updates.displayName !== null) {
    if (typeof updates.displayName !== "string" || (updates.displayName as string).length > 50) {
      return NextResponse.json({ error: "display_name must be a string (max 50 chars)" }, { status: 400 });
    }
  }
  if (updates.bio !== undefined && updates.bio !== null) {
    if (typeof updates.bio !== "string" || (updates.bio as string).length > 500) {
      return NextResponse.json({ error: "bio must be a string (max 500 chars)" }, { status: 400 });
    }
  }
  if (updates.tags !== undefined) {
    if (!Array.isArray(updates.tags) || !(updates.tags as unknown[]).every((t) => typeof t === "string")) {
      return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
    }
    if ((updates.tags as string[]).length > 10) {
      return NextResponse.json({ error: "Maximum 10 tags" }, { status: 400 });
    }
  }
  if (updates.hourlyRate !== undefined && updates.hourlyRate !== null) {
    const rate = parseFloat(String(updates.hourlyRate));
    if (isNaN(rate) || rate < 0) {
      return NextResponse.json({ error: "hourly_rate must be a non-negative number" }, { status: 400 });
    }
    updates.hourlyRate = String(rate);
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, auth.user.id))
    .returning();

  return NextResponse.json({
    user_id: updated.id,
    display_name: updated.displayName,
    bio: updated.bio,
    location: updated.location,
    tags: updated.tags || [],
    avatar_url: updated.avatarUrl,
    twitter_handle: updated.twitterHandle,
    github_handle: updated.githubHandle,
    website_url: updated.websiteUrl,
    hourly_rate: updated.hourlyRate,
  });
}
