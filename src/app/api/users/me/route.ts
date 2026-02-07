import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { eq, or } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/modules/db";
import { users, tasks } from "@/modules/db/schema";
import { serverData } from "@/modules/general/utils/server-constants";
import { getYellowUnifiedBalance } from "@/modules/yellow/server/balance";
import { authenticateUser } from "@/modules/users/auth";
import { resolveAllIdentities } from "@/modules/identity/resolve";
import { generateUniqueUsername } from "@/modules/identity/username";
import type { Address } from "viem";

const privy = new PrivyClient({
  appId: serverData.environment.PRIVY_APP_ID,
  appSecret: serverData.environment.PRIVY_APP_SECRET,
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Try standard auth first (Bearer, API key, wallet signature)
  const authResult = await authenticateUser(req);

  let user: typeof users.$inferSelect;
  let isNewUser = false;

  if (authResult.success) {
    user = authResult.user;
  } else {
    // Auto-create only for Bearer token users (new Privy signups)
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const token = authHeader.slice(7);
    let privyUserId: string;
    try {
      const claims = await privy.utils().auth().verifyAccessToken(token);
      privyUserId = claims.user_id;
    } catch {
      return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
    }

    // Fetch the Privy user to get their external (login) wallet address
    const privyUser = await privy.users()._get(privyUserId);
    const externalWallet = privyUser.linked_accounts?.find(
      (a) =>
        a.type === "wallet" &&
        "address" in a &&
        (!("connector_type" in a) || a.connector_type !== "embedded"),
    ) as { address: string } | undefined;
    const externalAddress = externalWallet?.address?.toLowerCase() || null;

    // Create an app-owned server wallet (owned by our signing key)
    const authPublicKey = serverData.environment.PRIVY_AUTHORIZATION_PUBLIC_KEY;
    const wallet = await privy.wallets().create({
      chain_type: "ethereum",
      owner: { public_key: authPublicKey },
    });

    const apiKey = `sk_${randomBytes(32).toString("hex")}`;
    const username = await generateUniqueUsername();
    const [inserted] = await db
      .insert(users)
      .values({
        walletAddress: wallet.address,
        privyWalletId: wallet.id,
        privyUserId,
        externalWalletAddress: externalAddress,
        apiKey,
        balance: "0",
        username,
      })
      .returning();
    user = inserted;
    isNewUser = true;
  }

  // Backfill external wallet address for Bearer users
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && !user.externalWalletAddress) {
    try {
      const token = authHeader.slice(7);
      const claims = await privy.utils().auth().verifyAccessToken(token);
      const privyUser = await privy.users()._get(claims.user_id);
      const externalWallet = privyUser.linked_accounts?.find(
        (a) =>
          a.type === "wallet" &&
          "address" in a &&
          (!("connector_type" in a) || a.connector_type !== "embedded"),
      ) as { address: string } | undefined;
      const externalAddress = externalWallet?.address?.toLowerCase() || null;
      if (externalAddress) {
        await db.update(users).set({ externalWalletAddress: externalAddress }).where(eq(users.id, user.id));
        user = { ...user, externalWalletAddress: externalAddress };
      }
    } catch {
      // backfill failed, continue
    }
  }

  // Backfill username for existing users without one
  if (!user.username) {
    const username = await generateUniqueUsername();
    await db.update(users).set({ username }).where(eq(users.id, user.id));
    user = { ...user, username };
  }

  // Resolve ENS/Base identities against the external (login) wallet
  const resolveAddress = (user.externalWalletAddress || user.walletAddress) as Address;
  if (!user.ensName && !user.baseName) {
    try {
      const result = await resolveAllIdentities(resolveAddress);
      const updates: Record<string, string | null> = {};
      if (result.ens) {
        updates.ensName = result.ens.name;
        updates.ensAvatar = result.ens.avatar;
      }
      if (result.baseName) {
        updates.baseName = result.baseName.name;
        updates.baseAvatar = result.baseName.avatar;
      }
      // Auto-set activeIdentity if user still has the default and a name was found
      const isAutoUsername = user.username && /^human-[a-z0-9]+$/.test(user.username);
      if (isAutoUsername && (!user.activeIdentity || user.activeIdentity === "username")) {
        if (result.ens) updates.activeIdentity = "ens";
        else if (result.baseName) updates.activeIdentity = "base";
      }
      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, user.id));
        user = { ...user, ...updates };
      }
    } catch {
      // resolution failed, continue without ENS/Base
    }
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

  const participantMap: Record<string, {
    walletAddress: string;
    username: string | null;
    ensName: string | null;
    baseName: string | null;
    activeIdentity: string | null;
  }> = {};
  if (participantIds.size > 0) {
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

  const enrichedTasks = userTasks.map((t) => ({
    ...t,
    creatorWallet: participantMap[t.creatorId]?.walletAddress || null,
    acceptorWallet: t.acceptorId ? participantMap[t.acceptorId]?.walletAddress || null : null,
    creator: participantMap[t.creatorId] ? {
      username: participantMap[t.creatorId].username,
      ens_name: participantMap[t.creatorId].ensName,
      base_name: participantMap[t.creatorId].baseName,
      active_identity: participantMap[t.creatorId].activeIdentity,
      wallet_address: participantMap[t.creatorId].walletAddress,
    } : null,
    acceptor: t.acceptorId && participantMap[t.acceptorId] ? {
      username: participantMap[t.acceptorId].username,
      ens_name: participantMap[t.acceptorId].ensName,
      base_name: participantMap[t.acceptorId].baseName,
      active_identity: participantMap[t.acceptorId].activeIdentity,
      wallet_address: participantMap[t.acceptorId].walletAddress,
    } : null,
  }));

  // Fetch Yellow Network balance (the only balance that matters)
  let yellowBalance = "0";
  if (user.privyWalletId) {
    try {
      yellowBalance = await getYellowUnifiedBalance(user.id, user.privyWalletId, user.walletAddress);
    } catch {
      // balance query may fail, default to 0
    }
  }

  return NextResponse.json({
    user_id: user.id,
    wallet_address: user.walletAddress,
    privy_wallet_id: user.privyWalletId,
    balance: yellowBalance,
    api_key: user.apiKey,
    is_new: isNewUser,
    tasks: enrichedTasks,
    bio: user.bio || null,
    location: user.location || null,
    tags: user.tags || [],
    avatar_url: user.avatarUrl || null,
    twitter_handle: user.twitterHandle || null,
    github_handle: user.githubHandle || null,
    website_url: user.websiteUrl || null,
    hourly_rate: user.hourlyRate || null,
    username: user.username || null,
    ens_name: user.ensName || null,
    ens_avatar: user.ensAvatar || null,
    base_name: user.baseName || null,
    base_avatar: user.baseAvatar || null,
    active_identity: user.activeIdentity || "username",
  });
}

const PROFILE_FIELDS: Record<string, string> = {
  bio: "bio",
  location: "location",
  tags: "tags",
  avatar_url: "avatarUrl",
  twitter_handle: "twitterHandle",
  github_handle: "githubHandle",
  website_url: "websiteUrl",
  hourly_rate: "hourlyRate",
  username: "username",
  active_identity: "activeIdentity",
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

  // Username validation
  if (updates.username !== undefined && updates.username !== null) {
    const uname = String(updates.username).toLowerCase();
    if (uname.length < 3 || uname.length > 30) {
      return NextResponse.json({ error: "Username must be 3-30 characters" }, { status: 400 });
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(uname)) {
      return NextResponse.json({ error: "Username must be lowercase alphanumeric (hyphens allowed in middle)" }, { status: 400 });
    }
    // Check uniqueness
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, uname))
      .limit(1);
    if (existing && existing.id !== auth.user.id) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
    }
    updates.username = uname;
  }

  // Active identity validation
  if (updates.activeIdentity !== undefined && updates.activeIdentity !== null) {
    const valid = ["username", "ens", "base"];
    if (!valid.includes(String(updates.activeIdentity))) {
      return NextResponse.json({ error: "active_identity must be one of: username, ens, base" }, { status: 400 });
    }
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, auth.user.id))
    .returning();

  return NextResponse.json({
    user_id: updated.id,
    bio: updated.bio,
    location: updated.location,
    tags: updated.tags || [],
    avatar_url: updated.avatarUrl,
    twitter_handle: updated.twitterHandle,
    github_handle: updated.githubHandle,
    website_url: updated.websiteUrl,
    hourly_rate: updated.hourlyRate,
    username: updated.username || null,
    ens_name: updated.ensName || null,
    ens_avatar: updated.ensAvatar || null,
    base_name: updated.baseName || null,
    base_avatar: updated.baseAvatar || null,
    active_identity: updated.activeIdentity || "username",
  });
}
