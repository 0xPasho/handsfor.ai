import { NextRequest } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { verifyMessage } from "viem";
import { eq } from "drizzle-orm";
import { db } from "@/modules/db";
import { users } from "@/modules/db/schema";
import { serverData } from "@/modules/general/utils/server-constants";

type User = typeof users.$inferSelect;

type AuthResult =
  | { success: true; user: User }
  | { success: false; error: string; status: number };

const privy = new PrivyClient({
  appId: serverData.environment.PRIVY_APP_ID,
  appSecret: serverData.environment.PRIVY_APP_SECRET,
});

/**
 * Authenticate a user from a request using one of:
 *   Option A: Authorization: Bearer <privy_token>
 *   Option B: X-API-Key header
 *   Option C: X-Signature + X-Timestamp + X-User-Id headers (server wallet)
 *   Option D: X-Signature + X-Timestamp + X-Wallet-Address headers (external wallet)
 */
export async function authenticateUser(req: NextRequest): Promise<AuthResult> {
  // Option A: Privy Bearer token
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const claims = await privy.utils().auth().verifyAccessToken(token);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.privyUserId, claims.user_id))
        .limit(1);

      if (!user) {
        return { success: false, error: "User not found", status: 401 };
      }

      return { success: true, user };
    } catch {
      return { success: false, error: "Invalid access token", status: 401 };
    }
  }

  // Option B: API key
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.apiKey, apiKey))
      .limit(1);

    if (!user) {
      return { success: false, error: "Invalid API key", status: 401 };
    }

    return { success: true, user };
  }

  // Shared: signature + timestamp
  const signature = req.headers.get("x-signature") as `0x${string}` | null;
  const timestamp = req.headers.get("x-timestamp");

  if (!signature || !timestamp) {
    return { success: false, error: "Missing authentication", status: 401 };
  }

  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return { success: false, error: "Timestamp expired or invalid", status: 401 };
  }

  // Option C: Wallet signature with user ID (legacy — verifies against server wallet)
  const userId = req.headers.get("x-user-id");
  if (userId) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { success: false, error: "User not found", status: 401 };
    }

    const message = `${timestamp}:${userId}`;
    const valid = await verifyMessage({
      address: user.walletAddress as `0x${string}`,
      message,
      signature,
    });

    if (!valid) {
      return { success: false, error: "Invalid signature", status: 401 };
    }

    return { success: true, user };
  }

  // Option D: Wallet signature with external wallet address
  const walletAddress = req.headers.get("x-wallet-address")?.toLowerCase();
  if (walletAddress) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.externalWalletAddress, walletAddress))
      .limit(1);

    if (!user) {
      return { success: false, error: "No account found for this wallet", status: 401 };
    }

    const message = `${timestamp}`;
    const valid = await verifyMessage({
      address: walletAddress as `0x${string}`,
      message,
      signature,
    });

    if (!valid) {
      return { success: false, error: "Invalid signature", status: 401 };
    }

    return { success: true, user };
  }

  return { success: false, error: "Missing authentication", status: 401 };
}
