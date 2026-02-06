import { Client } from "yellow-ts";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  createGetLedgerBalancesMessage,
  RPCMethod,
  type AuthChallengeResponse,
  type RPCResponse,
} from "@erc7824/nitrolite";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base, sepolia } from "viem/chains";
import { serverData } from "@/modules/general/utils/server-constants";
import { getYellowCurrency } from "../currency";

const privy = new PrivyClient({
  appId: serverData.environment.PRIVY_APP_ID,
  appSecret: serverData.environment.PRIVY_APP_SECRET,
});

const APP_NAME = "handfor.ai";
const AUTH_SCOPE = "handfor.ai";

function getChain() {
  return serverData.isTestnet ? sepolia : base;
}

// Cache: { walletAddress -> { balance, timestamp } }
const balanceCache = new Map<string, { balance: string; ts: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds
const QUERY_TIMEOUT_MS = 10_000; // 10 seconds

/**
 * Query a user's Yellow unified balance using Privy-backed auth.
 * Cached for 60s and times out after 10s to avoid blocking page loads.
 */
export async function getYellowUnifiedBalance(
  userId: string,
  privyWalletId: string,
  walletAddress: string,
): Promise<string> {
  // Check cache first
  const cached = balanceCache.get(walletAddress);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.balance;
  }

  // Race against a timeout
  const result = await Promise.race([
    fetchYellowBalance(userId, privyWalletId, walletAddress),
    new Promise<string>((resolve) =>
      setTimeout(() => resolve(cached?.balance ?? "0"), QUERY_TIMEOUT_MS),
    ),
  ]);

  balanceCache.set(walletAddress, { balance: result, ts: Date.now() });
  return result;
}

async function fetchYellowBalance(
  userId: string,
  privyWalletId: string,
  walletAddress: string,
): Promise<string> {
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const expiresAtUnix = Math.floor(Date.now() / 1000) + 300; // 5 min is enough for a query
  const currency = getYellowCurrency();

  const authPrivateKey = serverData.environment.PRIVY_AUTHORIZATION_PRIVATE_KEY;

  const privyAccount = await createViemAccount(privy, {
    walletId: privyWalletId,
    address: walletAddress as Address,
    authorizationContext: {
      authorization_private_keys: [authPrivateKey],
    },
  });

  const walletSigner = createWalletClient({
    account: privyAccount,
    chain: getChain(),
    transport: http(),
  });

  const client = new Client({ url: serverData.environment.YELLOW_WS_URL });
  await client.connect();

  try {
    const authRequestMsg = await createAuthRequestMessage({
      address: walletAddress as Address,
      session_key: sessionAccount.address,
      application: APP_NAME,
      allowances: [{ asset: currency, amount: "0" }],
      expires_at: BigInt(expiresAtUnix),
      scope: AUTH_SCOPE,
    });

    let removeListener: (() => void) | undefined;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Yellow balance auth timed out"));
      }, 15000);

      removeListener = client.listen(async (message: RPCResponse) => {
        try {
          if (message.method === RPCMethod.AuthChallenge) {
            const eip712Signer = createEIP712AuthMessageSigner(
              walletSigner,
              {
                scope: AUTH_SCOPE,
                session_key: sessionAccount.address,
                expires_at: BigInt(expiresAtUnix),
                allowances: [{ asset: currency, amount: "0" }],
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
              reject(new Error("Yellow balance auth failed"));
            }
          }

          if (message.method === RPCMethod.Error) {
            clearTimeout(timeout);
            reject(new Error(`Yellow balance auth error: ${JSON.stringify(message.params)}`));
          }
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      client.sendMessage(authRequestMsg);
    });

    removeListener?.();
    console.log("[Yellow Balance] auth successful for", walletAddress);

    // Query balances
    const sessionSigner = createECDSAMessageSigner(sessionPrivateKey);
    const balanceMsg = await createGetLedgerBalancesMessage(sessionSigner);
    const response = await client.sendMessage(balanceMsg);

    if (response?.method === RPCMethod.Error) {
      console.warn("[Yellow Balance] query error:", response.params);
      return "0";
    }

    // Response format: { ledgerBalances: [{ asset: "ytest.usd", amount: "59999999.98" }] }
    const params = response?.params as { ledgerBalances?: Array<{ asset: string; amount: string }> } | undefined;
    const ledgerBalances = params?.ledgerBalances;
    if (Array.isArray(ledgerBalances)) {
      const entry = ledgerBalances.find((b) => b.asset === currency);
      if (entry) {
        console.log("[Yellow Balance] raw amount:", entry.amount);
        return entry.amount;
      }
    }

    return "0";
  } catch (err) {
    console.warn("[Yellow Balance] FAILED for", walletAddress, ":", err);
    return "0";
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}
