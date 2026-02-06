import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { eq, or } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/modules/db";
import { users, tasks } from "@/modules/db/schema";
import { serverData } from "@/modules/general/utils/server-constants";
import { getUsdcBalance } from "@/modules/evm/balance";
import { getYellowUnifiedBalance } from "@/modules/yellow/server/balance";

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
  });
}
