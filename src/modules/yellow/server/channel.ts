import {
  createCreateChannelMessage,
  createResizeChannelMessage,
  createGetChannelsMessageV2,
  NitroliteClient,
  RPCMethod,
  type RPCResponse,
  type Channel,
  type StateIntent,
  type Allocation,
  type FinalState,
  type State,
} from "@erc7824/nitrolite";
import type { Address, Hex } from "viem";
import { getDefaultChainId } from "../../evm/chains";
import { getYellowConfig } from "../config";
import type { YellowConnection } from "../types";

type ChannelInfo = {
  channelId: string;
  status: string;
  token: string;
  amount: string;
  chainId: number;
};

/**
 * Ensure a channel exists and resize it to allocate funds to the unified balance.
 * If an open channel already exists, reuses it. Otherwise creates a new one on-chain.
 */
export async function createAndFundChannel(
  conn: YellowConnection,
  tokenAddress: string,
  amountUsdc: string,
  nitroliteClient: NitroliteClient,
): Promise<{ success: boolean; channelId?: string; error?: string }> {
  const chainId = getDefaultChainId();

  // Check for an existing open channel that matches our token + chain
  const existingChannels = await listUserChannels(conn);
  let channelId: string;

  const matchingChannel = existingChannels.find(
    (ch) => ch.token.toLowerCase() === tokenAddress.toLowerCase() && ch.chainId === chainId
  );

  if (matchingChannel) {
    channelId = matchingChannel.channelId;
    console.log(`[Channel] Reusing existing channel: ${channelId} (token: ${tokenAddress}, chain: ${chainId})`);
  } else {
    // Step 1: Request channel creation from Yellow
    console.log(`[Channel] Requesting channel creation for token ${tokenAddress} on chain ${chainId}...`);
    const createMsg = await createCreateChannelMessage(conn.sessionSigner, {
      chain_id: chainId,
      token: tokenAddress as Address,
    });

    const createResponse = (await conn.client.sendMessage(createMsg)) as RPCResponse;

    if (createResponse?.method === RPCMethod.Error) {
      return {
        success: false,
        error: `Create channel error: ${JSON.stringify(createResponse.params)}`,
      };
    }

    // Step 2: Create channel on-chain
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams = createResponse.params as any;
    console.log(`[Channel] Yellow approved channel creation, executing on-chain...`);

    const { channelId: newChannelId, txHash: createTxHash } = await nitroliteClient.createChannel({
      channel: createParams.channel as Channel,
      unsignedInitialState: {
        intent: createParams.state.intent as StateIntent,
        version: BigInt(createParams.state.version),
        data: createParams.state.stateData as Hex,
        allocations: createParams.state.allocations as Allocation[],
      },
      serverSignature: createParams.serverSignature as Hex,
    });

    channelId = newChannelId;
    console.log(`[Channel] Created on-chain: ${channelId} (tx: ${createTxHash})`);
  }

  // Step 3: Resize channel to allocate funds to unified balance
  const config = await getYellowConfig();
  const allocateAmountUnits = BigInt(Math.floor(parseFloat(amountUsdc) * 1e6));

  console.log(`[Channel] Requesting resize: ${amountUsdc} USDC custody → channel → unified balance...`);
  const resizeMsg = await createResizeChannelMessage(conn.sessionSigner, {
    channel_id: channelId as Hex,
    resize_amount: allocateAmountUnits,   // custody → channel
    allocate_amount: allocateAmountUnits, // channel → unified balance
    funds_destination: config.brokerAddress as Address,
  });

  const resizeResponse = (await conn.client.sendMessage(resizeMsg)) as RPCResponse;

  if (resizeResponse?.method === RPCMethod.Error) {
    return {
      success: false,
      channelId,
      error: `Channel ready but resize failed: ${JSON.stringify(resizeResponse.params)}`,
    };
  }

  // Step 4: Execute resize on-chain
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resizeParams = resizeResponse.params as any;
  console.log(`[Channel] Yellow approved resize, executing on-chain...`);

  const previousState = await nitroliteClient.getChannelData(channelId as Hex);

  const resizeState: FinalState = {
    channelId: channelId as Hex,
    intent: resizeParams.state.intent as StateIntent,
    version: BigInt(resizeParams.state.version),
    data: resizeParams.state.stateData as Hex,
    allocations: resizeParams.state.allocations as Allocation[],
    serverSignature: resizeParams.serverSignature as Hex,
  };

  const { txHash: resizeTxHash } = await nitroliteClient.resizeChannel({
    resizeState,
    proofStates: [previousState.lastValidState as State],
  });

  console.log(`[Channel] Resize completed: ${channelId} (tx: ${resizeTxHash})`);

  return { success: true, channelId };
}

/**
 * List the user's open channels on Yellow Network.
 */
export async function listUserChannels(conn: YellowConnection): Promise<ChannelInfo[]> {
  const msg = createGetChannelsMessageV2(conn.walletAddress, "open" as never);
  const response = (await conn.client.sendMessage(msg)) as RPCResponse;

  if (response?.method === RPCMethod.Error) {
    throw new Error(`Get channels error: ${JSON.stringify(response.params)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params = response?.params as any;
  const channels = params?.channels || [];

  if (channels.length > 0) {
    console.log(`[Channel] Found ${channels.length} open channel(s):`, JSON.stringify(channels[0], (_, v) => typeof v === "bigint" ? v.toString() : v));
  }

  // Handle both snake_case (channel_id) and camelCase (channelId) from the API
  return channels.map((ch: Record<string, unknown>) => ({
    channelId: (ch.channel_id || ch.channelId) as string,
    status: (ch.status || "") as string,
    token: (ch.token || "") as string,
    amount: (ch.amount || "0") as string,
    chainId: (ch.chain_id || ch.chainId || 0) as number,
  }));
}
