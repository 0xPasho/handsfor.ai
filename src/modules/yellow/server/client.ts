import { Client } from "yellow-ts";
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createECDSAMessageSigner,
  createTransferMessage,
  createGetLedgerBalancesMessage,
  RPCMethod,
  type AuthChallengeResponse,
  type RPCResponse,
} from "@erc7824/nitrolite";
import { type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { YellowConnection } from "../types";

const DEFAULT_DURATION_SECONDS = 24 * 60 * 60;
const APP_NAME = "handfor.ai";
const AUTH_SCOPE = "handfor.ai";

function getWsUrl(): string {
  const url = process.env.YELLOW_WS_URL;
  if (!url) {
    throw new Error("YELLOW_WS_URL environment variable is not set");
  }
  return url;
}

/**
 * Connect to Yellow Network WebSocket and authenticate with an ephemeral session key (ECDSA).
 */
export async function createYellowConnection(
  sessionPrivateKey: string,
  walletAddress: string,
  allowanceUsdc: string,
  durationSeconds?: number,
): Promise<YellowConnection> {
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey as Hex);
  const sessionSigner = createECDSAMessageSigner(sessionPrivateKey as Hex);

  const expiresAt = BigInt(
    Math.floor(Date.now() / 1000) + (durationSeconds || DEFAULT_DURATION_SECONDS),
  );

  const client = new Client({ url: getWsUrl() });
  await client.connect();

  const authRequestMsg = await createAuthRequestMessage({
    address: walletAddress as Address,
    session_key: sessionKeyAccount.address,
    application: APP_NAME,
    allowances: [{ asset: "usdc", amount: allowanceUsdc }],
    expires_at: expiresAt,
    scope: AUTH_SCOPE,
  });

  const authComplete = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Yellow auth timed out after 30s"));
    }, 30000);

    client.listen(async (message: RPCResponse) => {
      try {
        if (message.method === RPCMethod.AuthChallenge) {
          const verifyMsg = await createAuthVerifyMessage(
            sessionSigner,
            message as AuthChallengeResponse,
          );
          await client.sendMessage(verifyMsg);
        }

        if (message.method === RPCMethod.AuthVerify) {
          clearTimeout(timeout);
          const params = message.params as { success?: boolean };
          if (params.success) {
            resolve();
          } else {
            reject(new Error("Yellow auth verification failed"));
          }
        }

        if (message.method === RPCMethod.Error) {
          clearTimeout(timeout);
          reject(new Error(`Yellow auth error: ${JSON.stringify(message.params)}`));
        }
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });

  await client.sendMessage(authRequestMsg);
  await authComplete;

  return {
    client,
    sessionSigner,
    sessionKeyAddress: sessionKeyAccount.address,
    walletAddress: walletAddress as Address,
  };
}

export async function yellowTransfer(
  conn: YellowConnection,
  destinationAddress: string,
  amountUsdc: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const transferMsg = await createTransferMessage(conn.sessionSigner, {
      destination: destinationAddress as Address,
      allocations: [{ asset: "usdc", amount: amountUsdc }],
    });

    const response = await conn.client.sendMessage(transferMsg);

    if (response?.method === RPCMethod.Error) {
      return {
        success: false,
        error: `Transfer error: ${JSON.stringify(response.params)}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Transfer failed",
    };
  }
}

export async function yellowGetBalances(
  conn: YellowConnection,
): Promise<{ success: boolean; balances?: unknown; error?: string }> {
  try {
    const msg = await createGetLedgerBalancesMessage(conn.sessionSigner);
    const response = await conn.client.sendMessage(msg);

    if (response?.method === RPCMethod.Error) {
      return {
        success: false,
        error: `Balance query error: ${JSON.stringify(response.params)}`,
      };
    }

    return { success: true, balances: response?.params };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Balance query failed",
    };
  }
}

export async function yellowDisconnect(conn: YellowConnection): Promise<void> {
  try {
    await conn.client.disconnect();
  } catch {
    // Swallow disconnect errors — connection may already be closed
  }
}
