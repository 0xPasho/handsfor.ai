import { Client } from "yellow-ts";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  RPCMethod,
  type AuthChallengeResponse,
  type RPCResponse,
  type MessageSigner,
} from "@erc7824/nitrolite";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base, sepolia } from "viem/chains";
import { serverData } from "@/modules/general/utils/server-constants";
import { getYellowCurrency } from "../currency";
import { db } from "@/modules/db";
import { yellowSessions } from "@/modules/db/schema";
import { eq, and } from "drizzle-orm";

const privy = new PrivyClient({
  appId: serverData.environment.PRIVY_APP_ID,
  appSecret: serverData.environment.PRIVY_APP_SECRET,
});

const APP_NAME = "handfor.ai";
const AUTH_SCOPE = "handfor.ai";
const SESSION_DURATION_SECONDS = 24 * 60 * 60;

function getChain() {
  return serverData.isTestnet ? sepolia : base;
}

type UserYellowSession = {
  sessionPrivateKey: Hex;
  sessionKeyAddress: Address;
  messageSigner: MessageSigner;
  expiresAt: Date;
};

/**
 * Authenticate a user's server wallet with Yellow Network.
 *
 * Uses Privy's viem adapter to create a wallet client that can sign EIP-712,
 * then uses it with the standard Yellow auth flow.
 *
 * When `yellowClient` is provided, authenticates on that existing connection
 * (required for app sessions where all participants must be on the same connection).
 * Otherwise creates a standalone connection.
 */
export async function authenticateUserWithYellow(params: {
  userId: string;
  privyWalletId: string;
  walletAddress: Address;
  allowance: string;
  yellowClient?: Client;
}): Promise<UserYellowSession> {
  // Generate ephemeral session key
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const expiresAtUnix = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const expiresAt = new Date(expiresAtUnix * 1000);
  const currency = getYellowCurrency();

  const authPrivateKey = serverData.environment.PRIVY_AUTHORIZATION_PRIVATE_KEY;

  // Create a viem account backed by Privy server wallet
  const privyAccount = await createViemAccount(privy, {
    walletId: params.privyWalletId,
    address: params.walletAddress,
    authorizationContext: {
      authorization_private_keys: [authPrivateKey],
    },
  });

  const walletSigner = createWalletClient({
    account: privyAccount,
    chain: getChain(),
    transport: http(),
  });

  // Use provided client or create a standalone one
  const ownClient = !params.yellowClient;
  const client = params.yellowClient ?? new Client({ url: serverData.environment.YELLOW_WS_URL });
  if (ownClient) {
    await client.connect();
  }

  try {
    const authRequestMsg = await createAuthRequestMessage({
      address: params.walletAddress,
      session_key: sessionAccount.address,
      application: APP_NAME,
      allowances: [{ asset: currency, amount: params.allowance }],
      expires_at: BigInt(expiresAtUnix),
      scope: AUTH_SCOPE,
    });

    let removeListener: (() => void) | undefined;

    const authComplete = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("User Yellow auth timed out after 30s"));
      }, 30000);

      removeListener = client.listen(async (message: RPCResponse) => {
        try {
          if (message.method === RPCMethod.AuthChallenge) {
            const eip712Signer = createEIP712AuthMessageSigner(
              walletSigner,
              {
                scope: AUTH_SCOPE,
                session_key: sessionAccount.address,
                expires_at: BigInt(expiresAtUnix),
                allowances: [{ asset: currency, amount: params.allowance }],
              },
              { name: APP_NAME },
            );

            const verifyMsg = await createAuthVerifyMessage(
              eip712Signer,
              message as AuthChallengeResponse,
            );
            await client.sendMessage(verifyMsg);
          }

          if (message.method === RPCMethod.AuthVerify) {
            clearTimeout(timeout);
            const p = message.params as { success?: boolean };
            if (p.success) {
              resolve();
            } else {
              reject(new Error("User Yellow auth verification failed"));
            }
          }

          if (message.method === RPCMethod.Error) {
            clearTimeout(timeout);
            reject(new Error(`User Yellow auth error: ${JSON.stringify(message.params)}`));
          }
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });

    await client.sendMessage(authRequestMsg);
    await authComplete;

    // Remove listener so it doesn't interfere with other auth flows on shared connections
    removeListener?.();
  } finally {
    // Only disconnect if we created the client ourselves
    if (ownClient) {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  }

  // Store the session in DB
  await db.insert(yellowSessions).values({
    userId: params.userId,
    sessionKeyAddress: sessionAccount.address,
    sessionPrivateKey: sessionPrivateKey,
    walletAddress: params.walletAddress,
    allowance: params.allowance,
    expiresAt,
  });

  return {
    sessionPrivateKey,
    sessionKeyAddress: sessionAccount.address,
    messageSigner: createECDSAMessageSigner(sessionPrivateKey),
    expiresAt,
  };
}

/**
 * Get or create an active Yellow session for a user.
 */
export async function ensureUserYellowSession(params: {
  userId: string;
  privyWalletId: string;
  walletAddress: Address;
  allowance: string;
  yellowClient?: Client;
}): Promise<UserYellowSession> {
  // When authenticating on a shared connection, we always need a fresh auth
  // because the server tracks session keys per-connection
  if (params.yellowClient) {
    return authenticateUserWithYellow(params);
  }

  // Check for existing active session (standalone mode only)
  const [existing] = await db
    .select()
    .from(yellowSessions)
    .where(and(eq(yellowSessions.userId, params.userId), eq(yellowSessions.status, "active")))
    .limit(1);

  if (existing && existing.expiresAt > new Date()) {
    const key = existing.sessionPrivateKey as Hex;
    return {
      sessionPrivateKey: key,
      sessionKeyAddress: existing.sessionKeyAddress as Address,
      messageSigner: createECDSAMessageSigner(key),
      expiresAt: existing.expiresAt,
    };
  }

  // Create new session
  return authenticateUserWithYellow(params);
}
