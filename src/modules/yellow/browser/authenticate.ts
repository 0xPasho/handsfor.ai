import { Client } from "yellow-ts";
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  RPCMethod,
  type AuthChallengeResponse,
  type RPCResponse,
} from "@erc7824/nitrolite";
import { createWalletClient, http, type Hex, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { getYellowCurrency } from "../currency";

const DEFAULT_DURATION_SECONDS = 24 * 60 * 60;
const APP_NAME = "handfor.ai";
const AUTH_SCOPE = "handfor.ai";

type AuthenticateParams = {
  walletPrivateKey: string;
  sessionKeyAddress: string;
  allowance: string;
  wsUrl: string;
  chain?: Chain;
  durationSeconds?: number;
};

/**
 * Authenticate a Yellow Network session from the browser using EIP-712.
 *
 * The wallet private key signs the auth challenge via EIP-712 typed data,
 * authorizing the ephemeral session key on Yellow Network.
 *
 * After authentication, the browser disconnects — the server will reconnect
 * using the session key for ECDSA-authenticated operations.
 */
export async function authenticateYellowSession(
  params: AuthenticateParams,
): Promise<{ success: boolean; error?: string }> {
  const {
    walletPrivateKey,
    sessionKeyAddress,
    allowance,
    wsUrl,
    chain = sepolia,
    durationSeconds,
  } = params;

  let client: Client | null = null;

  try {
    const walletAccount = privateKeyToAccount(walletPrivateKey as Hex);
    const walletSigner = createWalletClient({
      account: walletAccount,
      chain,
      transport: http(),
    });

    const expiresAt = BigInt(
      Math.floor(Date.now() / 1000) + (durationSeconds || DEFAULT_DURATION_SECONDS),
    );

    client = new Client({ url: wsUrl });
    await client.connect();

    const authRequestMsg = await createAuthRequestMessage({
      address: walletAccount.address,
      session_key: sessionKeyAddress as `0x${string}`,
      application: APP_NAME,
      allowances: [{ asset: getYellowCurrency(), amount: allowance }],
      expires_at: expiresAt,
      scope: AUTH_SCOPE,
    });

    client.sendMessage(authRequestMsg);

    const authComplete = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Yellow auth timed out after 30s"));
      }, 30000);

      client!.listen(async (message: RPCResponse) => {
        try {
          if (message.method === RPCMethod.AuthChallenge) {
            const eip712Signer = createEIP712AuthMessageSigner(
              walletSigner,
              {
                scope: AUTH_SCOPE,
                session_key: sessionKeyAddress as `0x${string}`,
                expires_at: expiresAt,
                allowances: [{ asset: getYellowCurrency(), amount: allowance }],
              },
              { name: APP_NAME },
            );

            const verifyMsg = await createAuthVerifyMessage(
              eip712Signer,
              message as AuthChallengeResponse,
            );
            await client!.sendMessage(verifyMsg);
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

    await authComplete;

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Authentication failed",
    };
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // Swallow disconnect errors
      }
    }
  }
}
