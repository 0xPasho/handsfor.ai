import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { PrivyClient } from "@privy-io/node";
import { db } from "@/modules/db";
import { users, deposits } from "@/modules/db/schema";
import { serverData } from "@/modules/general/utils/server-constants";
import { type Address } from "viem";
import { depositAndAllocateForUser, depositAndAllocateForUserTestnet } from "@/modules/yellow/server/funds";
import { getYellowUnifiedBalance } from "@/modules/yellow/server/balance";
import { authenticateUser } from "@/modules/users/auth";
import { generateUniqueUsername } from "@/modules/identity/username";
import { resolveAllIdentities } from "@/modules/identity/resolve";

const privy = new PrivyClient({
  appId: serverData.environment.PRIVY_APP_ID,
  appSecret: serverData.environment.PRIVY_APP_SECRET,
});

// Production only: x402 facilitator + resource server
const facilitatorClient = new HTTPFacilitatorClient({ url: serverData.environment.X402_FACILITATOR_URL });
const x402Server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(x402Server, {});
const x402Network = "eip155:8453";

/**
 * Testnet: deposit via faucet, authenticated with Bearer/API key/Signature.
 */
async function handleDepositTestnet(req: NextRequest, amountUsdc: string): Promise<NextResponse> {
  const authResult = await authenticateUser(req);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const user = authResult.user;

  if (!user.privyWalletId) {
    return NextResponse.json({ error: "No server wallet configured" }, { status: 400 });
  }

  // Insert pending deposit
  const [deposit] = await db
    .insert(deposits)
    .values({
      userId: user.id,
      amount: amountUsdc,
      sourceAddress: "faucet",
      status: "pending",
    })
    .returning();

  try {
    await depositAndAllocateForUserTestnet({
      userId: user.id,
      privyWalletId: user.privyWalletId,
      walletAddress: user.walletAddress,
      amount: amountUsdc,
    });

    await db
      .update(deposits)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(deposits.id, deposit.id));

    let yellowBalance = "0";
    try {
      yellowBalance = await getYellowUnifiedBalance(user.id, user.privyWalletId, user.walletAddress);
    } catch {
      // balance query may fail, continue
    }

    return NextResponse.json({
      deposit_id: deposit.id,
      amount: amountUsdc,
      balance: yellowBalance,
    });
  } catch (err) {
    await db
      .update(deposits)
      .set({ status: "failed" })
      .where(eq(deposits.id, deposit.id));

    return NextResponse.json(
      { error: `Deposit failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 },
    );
  }
}

/**
 * Production: deposit via x402 payment. Auto-creates user on first deposit.
 */
async function handleDeposit(req: NextRequest): Promise<NextResponse> {
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
    const username = await generateUniqueUsername();
    const [inserted] = await db
      .insert(users)
      .values({
        walletAddress: wallet.address,
        privyWalletId: wallet.id,
        privyUserId: privyUser.id,
        externalWalletAddress: payerAddress,
        apiKey,
        balance: "0",
        username,
      })
      .returning();
    user = inserted;
    isNewUser = true;

    // Fire-and-forget ENS/Base resolution for new x402 users
    resolveAllIdentities(payerAddress as Address).then(async (result) => {
      try {
        const identityUpdates: Record<string, string | null> = {};
        if (result.ens) {
          identityUpdates.ensName = result.ens.name;
          identityUpdates.ensAvatar = result.ens.avatar;
          identityUpdates.activeIdentity = "ens";
        } else if (result.baseName) {
          identityUpdates.baseName = result.baseName.name;
          identityUpdates.baseAvatar = result.baseName.avatar;
          identityUpdates.activeIdentity = "base";
        }
        if (Object.keys(identityUpdates).length > 0) {
          await db.update(users).set(identityUpdates).where(eq(users.id, inserted.id));
        }
      } catch {
        // identity resolution failed, continue
      }
    }).catch(() => {});
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

  // Insert pending deposit
  const [deposit] = await db
    .insert(deposits)
    .values({
      userId: user.id,
      amount: amountUsdc,
      sourceAddress: payerAddress,
      status: "pending",
    })
    .returning();

  try {
    await depositAndAllocateForUser({
      userId: user.id,
      privyWalletId: user.privyWalletId!,
      walletAddress: user.walletAddress,
      amount: amountUsdc,
    });

    await db
      .update(deposits)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(deposits.id, deposit.id));

    let yellowBalance = "0";
    try {
      yellowBalance = await getYellowUnifiedBalance(user.id, user.privyWalletId!, user.walletAddress);
    } catch {
      // balance query may fail
    }

    return NextResponse.json({
      deposit_id: deposit.id,
      user_id: user.id,
      wallet_address: user.walletAddress,
      ...(isNewUser ? { api_key: user.apiKey } : {}),
      amount: amountUsdc,
      balance: yellowBalance,
    });
  } catch (err) {
    await db
      .update(deposits)
      .set({ status: "failed" })
      .where(eq(deposits.id, deposit.id));

    return NextResponse.json(
      { error: `Deposit failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const amount = url.searchParams.get("amount") || "10";

  if (serverData.isTestnet) {
    return handleDepositTestnet(req, amount);
  }

  const price = `$${amount}`;
  const handler = withX402(
    handleDeposit,
    {
      accepts: {
        scheme: "exact",
        payTo: serverData.environment.PLATFORM_WALLET_ADDRESS,
        price,
        network: x402Network,
      },
      description: "Deposit USDC",
    },
    x402Server,
  );

  return handler(req);
}
