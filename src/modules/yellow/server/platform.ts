import { Client } from "yellow-ts";
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  createAppSessionMessage,
  createCloseAppSessionMessage,
  RPCMethod,
  RPCProtocolVersion,
  type AuthChallengeResponse,
  type RPCResponse,
  type RPCAppDefinition,
  type RPCAppSessionAllocation,
  type RPCData,
  type MessageSigner,
} from "@erc7824/nitrolite";
import {
  NitroliteClient,
  WalletStateSigner,
  createCreateChannelMessage,
  createResizeChannelMessage,
  createCloseChannelMessage,
  createGetChannelsMessageV2,
  type ContractAddresses,
  type FinalState,
  type StateIntent,
  type Allocation,
} from "@erc7824/nitrolite";
import { createWalletClient, createPublicClient, http, parseUnits, type Hex, type Address } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { base, sepolia } from "viem/chains";
import { serverData } from "@/modules/general/utils/server-constants";
import { getYellowCurrency } from "../currency";
import { getYellowContractAddresses, getYellowSupportedAssets } from "../config";
import { getDefaultChainId, TOKEN_ADDRESSES, USDC_DECIMALS } from "@/modules/evm/chains";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import { ensureUserYellowSession } from "./user-auth";
import { requestSandboxFaucet } from "./funds";
import { listUserChannels } from "./channel";
import { getYellowConfig } from "../config";
import type { YellowConnection } from "../types";

const APP_NAME = "handfor.ai";
const AUTH_SCOPE = "handfor.ai";
const SESSION_DURATION_SECONDS = 24 * 60 * 60;

type PlatformConnection = {
  client: Client;
  messageSigner: MessageSigner;
  address: Address;
  expiresAt: number;
};

let cachedConnection: PlatformConnection | null = null;

function getChain() {
  return serverData.isTestnet ? sepolia : base;
}

/**
 * Get or create a platform Yellow connection.
 * The platform authenticates with its own wallet and maintains a persistent-ish connection.
 */
export async function getPlatformConnection(): Promise<PlatformConnection> {
  // Reuse if still valid (with 5min buffer)
  if (cachedConnection) {
    const now = Math.floor(Date.now() / 1000);
    if (cachedConnection.expiresAt - now > 300) {
      return cachedConnection;
    }
    // Expired or about to expire, disconnect and reconnect
    try {
      await cachedConnection.client.disconnect();
    } catch {
      // ignore
    }
    cachedConnection = null;
  }

  const platformKey = serverData.environment.PLATFORM_WALLET_PRIVATE_KEY as Hex;
  const platformAccount = privateKeyToAccount(platformKey);

  const walletSigner = createWalletClient({
    account: platformAccount,
    chain: getChain(),
    transport: http(),
  });

  // Generate ephemeral session key
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;

  const client = new Client({ url: serverData.environment.YELLOW_WS_URL });
  await client.connect();

  // Send auth request
  const authRequestMsg = await createAuthRequestMessage({
    address: platformAccount.address,
    session_key: sessionAccount.address,
    application: APP_NAME,
    allowances: [{ asset: getYellowCurrency(), amount: "1000" }],
    expires_at: BigInt(expiresAt),
    scope: AUTH_SCOPE,
  });

  // Wait for auth to complete
  const authComplete = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Platform Yellow auth timed out after 30s"));
    }, 30000);

    client.listen(async (message: RPCResponse) => {
      try {
        if (message.method === RPCMethod.AuthChallenge) {
          const eip712Signer = createEIP712AuthMessageSigner(
            walletSigner,
            {
              scope: AUTH_SCOPE,
              session_key: sessionAccount.address,
              expires_at: BigInt(expiresAt),
              allowances: [{ asset: getYellowCurrency(), amount: "1000" }],
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
          const params = message.params as { success?: boolean };
          if (params.success) {
            resolve();
          } else {
            reject(new Error("Platform Yellow auth verification failed"));
          }
        }

        if (message.method === RPCMethod.Error) {
          clearTimeout(timeout);
          reject(new Error(`Platform Yellow auth error: ${JSON.stringify(message.params)}`));
        }
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });

  await client.sendMessage(authRequestMsg);
  await authComplete;

  const messageSigner = createECDSAMessageSigner(sessionPrivateKey);

  cachedConnection = {
    client,
    messageSigner,
    address: platformAccount.address,
    expiresAt,
  };

  return cachedConnection;
}

let platformInitialized = false;

/**
 * Ensure the platform wallet has USDC deposited to Yellow custody and a channel.
 * Called once on first app session creation.
 */
async function ensurePlatformReady(): Promise<void> {
  if (platformInitialized) return;

  const chainId = getDefaultChainId();
  const chain = serverData.isTestnet ? sepolia : base;
  const platformKey = serverData.environment.PLATFORM_WALLET_PRIVATE_KEY as Hex;
  const platformAccount = privateKeyToAccount(platformKey);

  const walletClient = createWalletClient({
    account: platformAccount,
    chain,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  const contracts = await getYellowContractAddresses(chainId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nitroliteClient = new NitroliteClient({
    walletClient: walletClient as any,
    publicClient: publicClient as any,
    stateSigner: new WalletStateSigner(walletClient as any),
    addresses: contracts as ContractAddresses,
    chainId,
    challengeDuration: 3600n,
  });

  // Check if platform already has open channels
  const openChannels = await nitroliteClient.getOpenChannels();
  if (openChannels.length > 0) {
    platformInitialized = true;
    return;
  }

  // Platform needs a channel — create one via Yellow
  // Query the sandbox for the actual supported token + chain
  const conn = await getPlatformConnection();
  const assets = await getYellowSupportedAssets();
  const usdAsset = assets.find((a) => a.symbol.toLowerCase() === "usdc")
    || assets.find((a) => a.symbol.toLowerCase().includes("usd"));
  if (!usdAsset) {
    throw new Error(`No USD token found in Yellow supported assets: ${assets.map((a) => a.symbol).join(", ")}`);
  }

  const createMsg = await createCreateChannelMessage(conn.messageSigner, {
    chain_id: usdAsset.chainId,
    token: usdAsset.address as Address,
  });

  const createResponse = await conn.client.sendMessage(createMsg);
  if (createResponse?.method === RPCMethod.Error) {
    throw new Error(`Platform channel creation failed: ${JSON.stringify(createResponse.params)}`);
  }

  platformInitialized = true;
}

/**
 * Authenticate the platform wallet on a given Yellow client connection.
 * Returns the platform's message signer and address.
 */
async function authenticatePlatformOnClient(client: Client): Promise<{
  messageSigner: MessageSigner;
  address: Address;
}> {
  const platformKey = serverData.environment.PLATFORM_WALLET_PRIVATE_KEY as Hex;
  const platformAccount = privateKeyToAccount(platformKey);

  const walletSigner = createWalletClient({
    account: platformAccount,
    chain: getChain(),
    transport: http(),
  });

  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;

  const authRequestMsg = await createAuthRequestMessage({
    address: platformAccount.address,
    session_key: sessionAccount.address,
    application: APP_NAME,
    allowances: [{ asset: getYellowCurrency(), amount: "1000" }],
    expires_at: BigInt(expiresAt),
    scope: AUTH_SCOPE,
  });

  let removeListener: (() => void) | undefined;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Platform auth timed out after 30s"));
    }, 30000);

    removeListener = client.listen(async (message: RPCResponse) => {
      try {
        if (message.method === RPCMethod.AuthChallenge) {
          const eip712Signer = createEIP712AuthMessageSigner(
            walletSigner,
            {
              scope: AUTH_SCOPE,
              session_key: sessionAccount.address,
              expires_at: BigInt(expiresAt),
              allowances: [{ asset: getYellowCurrency(), amount: "1000" }],
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
          const params = message.params as { success?: boolean };
          if (params.success) {
            resolve();
          } else {
            reject(new Error("Platform auth verification failed"));
          }
        }

        if (message.method === RPCMethod.Error) {
          clearTimeout(timeout);
          reject(new Error(`Platform auth error: ${JSON.stringify(message.params)}`));
        }
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });

    client.sendMessage(authRequestMsg);
  });

  // Remove listener so it doesn't interfere with subsequent auth flows on this connection
  removeListener?.();

  return {
    messageSigner: createECDSAMessageSigner(sessionPrivateKey),
    address: platformAccount.address,
  };
}

/**
 * Close any existing channels with non-zero allocation for a user.
 * Needed on testnet to clean up leftover channels from previous on-chain test runs.
 * Sends close_channel RPC to Yellow, then executes close on-chain.
 */
async function closeExistingChannels(
  yellowClient: Client,
  userMessageSigner: MessageSigner,
  params: { creatorAddress: Address; privyWalletId: string },
): Promise<void> {
  const conn: YellowConnection = {
    client: yellowClient,
    sessionSigner: userMessageSigner,
    sessionKeyAddress: params.creatorAddress, // not used by listUserChannels
    walletAddress: params.creatorAddress,
  };

  console.log(`[Cleanup] Checking channels for ${params.creatorAddress}...`);

  // Query ALL channels (no status filter) — listUserChannels only queries "open"
  const allChannelsMsg = createGetChannelsMessageV2(params.creatorAddress);
  const allChannelsResp = await yellowClient.sendMessage(allChannelsMsg) as RPCResponse;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawChannels = (allChannelsResp?.params as any)?.channels || [];
  const channels = rawChannels.map((ch: Record<string, unknown>) => ({
    channelId: (ch.channel_id || ch.channelId) as string,
    status: (ch.status || "") as string,
    token: (ch.token || "") as string,
    amount: (ch.amount || "0") as string,
    chainId: (ch.chain_id || ch.chainId || 0) as number,
  }));
  console.log(`[Cleanup] Found ${channels.length} channel(s):`, JSON.stringify(channels, (_, v) => typeof v === "bigint" ? v.toString() : v));
  const nonZeroChannels = channels.filter((ch: { amount: string; channelId: string }) => ch.amount !== "0" && ch.channelId);
  if (nonZeroChannels.length === 0) {
    console.log(`[Cleanup] No channels with non-zero allocation, skipping`);
    return;
  }

  console.log(`[Cleanup] Found ${nonZeroChannels.length} channel(s) with non-zero allocation, closing...`);

  // Set up NitroliteClient for on-chain close
  const chainId = getDefaultChainId();
  const chain = getChain();
  const contracts = await getYellowContractAddresses(chainId);
  const config = await getYellowConfig();

  const privy = new PrivyClient({
    appId: serverData.environment.PRIVY_APP_ID,
    appSecret: serverData.environment.PRIVY_APP_SECRET,
  });

  const account = await createViemAccount(privy, {
    walletId: params.privyWalletId,
    address: params.creatorAddress as `0x${string}`,
    authorizationContext: {
      authorization_private_keys: [serverData.environment.PRIVY_AUTHORIZATION_PRIVATE_KEY],
    },
  });

  const walletClient = createWalletClient({ account, chain, transport: http() });
  const publicClient = createPublicClient({ chain, transport: http() });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nitroliteClient = new NitroliteClient({
    walletClient: walletClient as any,
    publicClient: publicClient as any,
    stateSigner: new WalletStateSigner(walletClient as any),
    addresses: contracts as ContractAddresses,
    chainId,
    challengeDuration: 3600n,
  });

  for (const ch of nonZeroChannels) {
    try {
      console.log(`[Cleanup] Closing channel ${ch.channelId}...`);

      // Send close_channel RPC to Yellow
      const closeMsg = await createCloseChannelMessage(
        userMessageSigner,
        ch.channelId as Hex,
        config.brokerAddress as Address, // funds → unified balance
      );

      const closeResp = await yellowClient.sendMessage(closeMsg) as RPCResponse;
      if (closeResp?.method === RPCMethod.Error) {
        console.warn(`[Cleanup] Yellow rejected close for ${ch.channelId}: ${JSON.stringify(closeResp.params)}`);
        continue;
      }

      // Execute close on-chain
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const closeParams = closeResp.params as any;
      const finalState: FinalState = {
        channelId: ch.channelId as Hex,
        intent: closeParams.state.intent as StateIntent,
        version: BigInt(closeParams.state.version),
        data: closeParams.state.stateData as Hex,
        allocations: closeParams.state.allocations as Allocation[],
        serverSignature: closeParams.serverSignature as Hex,
      };

      const txHash = await nitroliteClient.closeChannel({
        stateData: closeParams.state.stateData as Hex,
        finalState,
      });

      // Wait for on-chain confirmation so Yellow picks up the state change
      await publicClient.waitForTransactionReceipt({ timeout: 120_000, hash: txHash });
      console.log(`[Cleanup] Channel ${ch.channelId} closed and confirmed (tx: ${txHash})`);
    } catch (err) {
      console.warn(`[Cleanup] Failed to close channel ${ch.channelId}:`, err);
      // Continue with other channels — don't block session creation
    }
  }

  // Brief delay for Yellow's backend to process the on-chain events
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

/**
 * Create a 2-party app session at task creation.
 * Participants: [Creator, Platform]
 * Weights: [100, 100], Quorum: 100
 *
 * Creates a fresh connection and authenticates both participants on it,
 * matching the Yellow SDK tutorial pattern.
 */
export async function createInitialTaskSession(params: {
  creatorAddress: Address;
  userId: string;
  privyWalletId: string;
  amount: string;
}): Promise<{ appSessionId: string }> {
  await ensurePlatformReady();

  // Fresh connection — both participants authenticate on the same WebSocket
  const client = new Client({ url: serverData.environment.YELLOW_WS_URL });
  await client.connect();

  try {
    // On sandbox, request test tokens for both participants
    // await Promise.all([
    //   requestSandboxFaucet(params.creatorAddress),
    //   requestSandboxFaucet(serverData.environment.PLATFORM_WALLET_ADDRESS),
    // ]);

    // Authenticate platform first
    const platform = await authenticatePlatformOnClient(client);

    // Authenticate user second
    const userSession = await ensureUserYellowSession({
      userId: params.userId,
      privyWalletId: params.privyWalletId,
      walletAddress: params.creatorAddress,
      allowance: params.amount,
      yellowClient: client,
    });

    // Close any leftover channels with non-zero allocation (testnet cleanup)
    console.log(`[Session] isTestnet=${serverData.isTestnet}, checking for channel cleanup...`);
    if (serverData.isTestnet) {
      await closeExistingChannels(client, userSession.messageSigner, params);
    }

    const currency = getYellowCurrency();

    const appDefinition: RPCAppDefinition = {
      protocol: RPCProtocolVersion.NitroRPC_0_4,
      participants: [params.creatorAddress, platform.address],
      weights: [100, 100],
      quorum: 100,
      challenge: 0,
      nonce: Date.now(),
      application: APP_NAME,
    };

    const allocations: RPCAppSessionAllocation[] = [
      { participant: params.creatorAddress, asset: currency, amount: params.amount },
      { participant: platform.address, asset: currency, amount: "0" },
    ];

    // Platform signs the session message
    const sessionMessage = await createAppSessionMessage(platform.messageSigner, {
      definition: appDefinition,
      allocations,
    });

    // Add creator's signature (both participants must sign)
    const parsed = JSON.parse(sessionMessage);
    const creatorSig = await userSession.messageSigner(parsed.req as RPCData);
    parsed.sig.unshift(creatorSig); // creator is first participant

    const response = await client.sendMessage(JSON.stringify(parsed));

    if (response?.method === RPCMethod.Error) {
      throw new Error(`Failed to create initial session: ${JSON.stringify(response.params)}`);
    }

    const appSessionId = response?.params?.appSessionId;
    if (!appSessionId) {
      throw new Error("Initial session response missing appSessionId");
    }

    return { appSessionId };
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}

/**
 * Transition from 2-party (creator+platform) to 3-party (creator+worker+platform).
 * Closes the existing 2-party session (funds back to creator),
 * then creates a new 3-party session with the worker added.
 * Weights: [50, 50, 100], Quorum: 100
 *
 * Uses a fresh connection with all participants authenticated.
 */
export async function transitionToWorkerSession(params: {
  existingAppSessionId: string;
  creatorAddress: Address;
  creatorUserId: string;
  creatorPrivyWalletId: string;
  acceptorAddress: Address;
  acceptorUserId: string;
  acceptorPrivyWalletId: string;
  amount: string;
}): Promise<{ appSessionId: string }> {
  const client = new Client({ url: serverData.environment.YELLOW_WS_URL });
  await client.connect();

  try {
    // Request faucet tokens for all participants on sandbox
    // await Promise.all([
    //   requestSandboxFaucet(params.creatorAddress),
    //   requestSandboxFaucet(params.acceptorAddress),
    //   requestSandboxFaucet(serverData.environment.PLATFORM_WALLET_ADDRESS),
    // ]);

    // Authenticate all 3 participants on the same connection
    const platform = await authenticatePlatformOnClient(client);

    const creatorSession = await ensureUserYellowSession({
      userId: params.creatorUserId,
      privyWalletId: params.creatorPrivyWalletId,
      walletAddress: params.creatorAddress,
      allowance: params.amount,
      yellowClient: client,
    });

    const acceptorSession = await ensureUserYellowSession({
      userId: params.acceptorUserId,
      privyWalletId: params.acceptorPrivyWalletId,
      walletAddress: params.acceptorAddress,
      allowance: params.amount,
      yellowClient: client,
    });

    const currency = getYellowCurrency();

    // Close existing 2-party session (return funds to creator)
    const closeAllocations: RPCAppSessionAllocation[] = [
      { participant: params.creatorAddress, asset: currency, amount: params.amount },
      { participant: platform.address, asset: currency, amount: "0" },
    ];

    const closeMessage = await createCloseAppSessionMessage(platform.messageSigner, {
      app_session_id: params.existingAppSessionId as `0x${string}`,
      allocations: closeAllocations,
    });

    // Add creator's signature to close message
    const closeParsed = JSON.parse(closeMessage);
    const creatorCloseSig = await creatorSession.messageSigner(closeParsed.req as RPCData);
    closeParsed.sig.unshift(creatorCloseSig);

    const closeResponse = await client.sendMessage(JSON.stringify(closeParsed));
    if (closeResponse?.method === RPCMethod.Error) {
      throw new Error(`Failed to close 2-party session: ${JSON.stringify(closeResponse.params)}`);
    }

    // Create new 3-party session with worker
    const appDefinition: RPCAppDefinition = {
      protocol: RPCProtocolVersion.NitroRPC_0_4,
      participants: [params.creatorAddress, params.acceptorAddress, platform.address],
      weights: [50, 50, 100],
      quorum: 100,
      challenge: 0,
      nonce: Date.now(),
      application: APP_NAME,
    };

    const allocations: RPCAppSessionAllocation[] = [
      { participant: params.creatorAddress, asset: currency, amount: params.amount },
      { participant: params.acceptorAddress, asset: currency, amount: "0" },
      { participant: platform.address, asset: currency, amount: "0" },
    ];

    // Platform signs the session message
    const sessionMessage = await createAppSessionMessage(platform.messageSigner, {
      definition: appDefinition,
      allocations,
    });

    // Add creator and acceptor signatures (all participants must sign)
    const parsed = JSON.parse(sessionMessage);
    const acceptorSig = await acceptorSession.messageSigner(parsed.req as RPCData);
    const creatorSig = await creatorSession.messageSigner(parsed.req as RPCData);
    // Signatures in participant order: [creator, acceptor, platform]
    parsed.sig.unshift(acceptorSig);
    parsed.sig.unshift(creatorSig);

    const response = await client.sendMessage(JSON.stringify(parsed));

    if (response?.method === RPCMethod.Error) {
      throw new Error(`Failed to create 3-party session: ${JSON.stringify(response.params)}`);
    }

    const appSessionId = response?.params?.appSessionId;
    if (!appSessionId) {
      throw new Error("3-party session response missing appSessionId");
    }

    return { appSessionId };
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}

/**
 * Invalidate the cached platform connection so the next call creates a fresh one.
 */
function invalidatePlatformConnection() {
  if (cachedConnection) {
    try {
      cachedConnection.client.disconnect();
    } catch {
      // ignore
    }
    cachedConnection = null;
  }
}

/**
 * Close an app session, allocating all funds to the winner.
 * Platform signs alone (weight 100 >= quorum 100).
 * Retries once with a fresh connection if the cached one is stale.
 */
export async function closeTaskAppSession(params: {
  appSessionId: string;
  creatorAddress: Address;
  acceptorAddress: Address;
  amount: string;
  winner: "creator" | "acceptor";
}): Promise<void> {
  const currency = getYellowCurrency();

  const winnerAmount = params.amount;
  const loserAmount = "0";

  for (let attempt = 0; attempt < 2; attempt++) {
    const conn = await getPlatformConnection();

    const allocations: RPCAppSessionAllocation[] = [
      {
        participant: params.creatorAddress,
        asset: currency,
        amount: params.winner === "creator" ? winnerAmount : loserAmount,
      },
      {
        participant: params.acceptorAddress,
        asset: currency,
        amount: params.winner === "acceptor" ? winnerAmount : loserAmount,
      },
      { participant: conn.address, asset: currency, amount: "0" },
    ];

    const closeMessage = await createCloseAppSessionMessage(conn.messageSigner, {
      app_session_id: params.appSessionId as `0x${string}`,
      allocations,
    });

    const response = await conn.client.sendMessage(closeMessage);

    if (response?.method === RPCMethod.Error) {
      const errorStr = JSON.stringify(response.params);
      // Stale connection — invalidate and retry once
      if (attempt === 0 && errorStr.includes("authentication required")) {
        console.warn("[Yellow] Platform connection stale, reconnecting...");
        invalidatePlatformConnection();
        continue;
      }
      throw new Error(`Failed to close app session: ${errorStr}`);
    }

    return; // success
  }
}

/**
 * Cancel a 2-party session (creator+platform), returning all funds to creator.
 * Used when a task is cancelled before any worker accepts.
 */
export async function cancelInitialSession(params: {
  appSessionId: string;
  creatorAddress: Address;
  amount: string;
}): Promise<void> {
  const currency = getYellowCurrency();

  for (let attempt = 0; attempt < 2; attempt++) {
    const conn = await getPlatformConnection();

    const allocations: RPCAppSessionAllocation[] = [
      { participant: params.creatorAddress, asset: currency, amount: params.amount },
      { participant: conn.address, asset: currency, amount: "0" },
    ];

    const closeMessage = await createCloseAppSessionMessage(conn.messageSigner, {
      app_session_id: params.appSessionId as `0x${string}`,
      allocations,
    });

    const response = await conn.client.sendMessage(closeMessage);
    if (response?.method === RPCMethod.Error) {
      const errorStr = JSON.stringify(response.params);
      if (attempt === 0 && errorStr.includes("authentication required")) {
        console.warn("[Yellow] Platform connection stale, reconnecting...");
        invalidatePlatformConnection();
        continue;
      }
      throw new Error(`Failed to cancel session: ${errorStr}`);
    }

    return;
  }
}
