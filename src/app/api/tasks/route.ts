import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { eq, and, type SQL } from "drizzle-orm";
import { randomBytes } from "crypto";
import { PrivyClient } from "@privy-io/node";
import { db } from "@/modules/db";
import { users, tasks } from "@/modules/db/schema";
import { serverData } from "@/modules/general/utils/server-constants";
import { type Address } from "viem";
import { depositAndAllocateForUser, depositAndAllocateForUserTestnet } from "@/modules/yellow/server/funds";
import { createInitialTaskSession } from "@/modules/yellow/server/platform";

const privy = new PrivyClient({
  appId: serverData.environment.PRIVY_APP_ID,
  appSecret: serverData.environment.PRIVY_APP_SECRET,
});

// Production only: x402 facilitator + resource server (not needed on testnet)
const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const x402Server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(x402Server, {});
const x402Network = "eip155:8453";

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
  try {
    const body = await req.json();
    description = body.description;
  } catch {
    // no body is fine
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

  const [task] = await db
    .insert(tasks)
    .values({
      creatorId: user.id,
      amount: amountUsdc,
      status: "open",
      description,
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
 * Production handler: extracts payer info from x402 payment header,
 * deposits USDC to Yellow custody, and creates session.
 */
async function handleCreateTask(req: NextRequest): Promise<NextResponse> {
  const paymentHeader =
    req.headers.get("payment-signature") || req.headers.get("x-payment");

  if (!paymentHeader) {
    return NextResponse.json({ error: "Missing payment header" }, { status: 400 });
  }

  const paymentPayload = decodePaymentSignatureHeader(paymentHeader);

  const authorization = paymentPayload.payload?.authorization as
    | { from?: string }
    | undefined;
  const payerAddress = authorization?.from?.toLowerCase();

  if (!payerAddress) {
    return NextResponse.json(
      { error: "Could not extract payer address" },
      { status: 400 },
    );
  }

  const amountAtomic = paymentPayload.accepted?.amount ?? "0";
  const amountUsdc = (parseInt(amountAtomic, 10) / 1e6).toString();

  // Find existing user by their external (payer) address
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.externalWalletAddress, payerAddress))
    .limit(1);

  let user = existingUser;
  let isNewUser = false;

  if (!user) {
    const privyUser = await privy.users().create({
      linked_accounts: [
        { type: "wallet", chain_type: "ethereum", address: payerAddress },
      ],
    });

    const wallet = await privy.wallets().create({
      chain_type: "ethereum",
      owner: { public_key: serverData.environment.PRIVY_AUTHORIZATION_PUBLIC_KEY },
    });

    const apiKey = `sk_${randomBytes(32).toString("hex")}`;
    const [inserted] = await db
      .insert(users)
      .values({
        walletAddress: wallet.address,
        privyWalletId: wallet.id,
        privyUserId: privyUser.id,
        externalWalletAddress: payerAddress,
        apiKey,
        balance: "0",
      })
      .returning();
    user = inserted;
    isNewUser = true;
  }

  if (!user.privyWalletId) {
    let privyUserId = user.privyUserId;
    if (!privyUserId) {
      const privyUser = await privy.users().create({
        linked_accounts: [
          { type: "wallet", chain_type: "ethereum", address: payerAddress },
        ],
      });
      privyUserId = privyUser.id;
    }

    const wallet = await privy.wallets().create({
      chain_type: "ethereum",
      owner: { public_key: serverData.environment.PRIVY_AUTHORIZATION_PUBLIC_KEY },
    });
    await db
      .update(users)
      .set({
        privyWalletId: wallet.id,
        privyUserId,
        walletAddress: wallet.address,
      })
      .where(eq(users.id, user.id));
    user = { ...user, privyWalletId: wallet.id, privyUserId, walletAddress: wallet.address };
  }

  let description: string | undefined;
  try {
    const body = await req.json();
    description = body.description;
  } catch {
    // no body or invalid JSON is fine
  }

  await depositAndAllocateForUser({
    userId: user.id,
    privyWalletId: user.privyWalletId!,
    walletAddress: user.walletAddress,
    amount: amountUsdc,
  });

  const { appSessionId } = await createInitialTaskSession({
    creatorAddress: user.walletAddress as Address,
    userId: user.id,
    privyWalletId: user.privyWalletId!,
    amount: amountUsdc,
  });

  const [task] = await db
    .insert(tasks)
    .values({
      creatorId: user.id,
      amount: amountUsdc,
      status: "open",
      description,
      appSessionId,
    })
    .returning();

  return NextResponse.json({
    task_id: task.id,
    user_id: user.id,
    wallet_address: user.walletAddress,
    ...(isNewUser ? { api_key: user.apiKey } : {}),
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

  const walletMap: Record<string, string> = {};
  if (participantIds.size > 0) {
    const { or } = await import("drizzle-orm");
    const participants = await db
      .select({ id: users.id, walletAddress: users.walletAddress })
      .from(users)
      .where(or(...[...participantIds].map((pid) => eq(users.id, pid))));
    for (const p of participants) {
      walletMap[p.id] = p.walletAddress;
    }
  }

  const enriched = results.map((t) => ({
    ...t,
    creatorWallet: walletMap[t.creatorId] || null,
    acceptorWallet: t.acceptorId ? walletMap[t.acceptorId] || null : null,
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

  // Production: x402 payment flow with remote facilitator on Base
  const price = `$${amount}`;
  const handler = withX402(
    handleCreateTask,
    {
      accepts: {
        scheme: "exact",
        payTo: serverData.environment.PLATFORM_WALLET_ADDRESS,
        price,
        network: x402Network,
      },
      description: "Create a task",
    },
    x402Server,
  );

  return handler(req);
}
