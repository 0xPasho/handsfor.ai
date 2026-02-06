"use server";

import { Client } from "yellow-ts";
import { createGetConfigMessageV2, createGetAssetsMessageV2 } from "@erc7824/nitrolite";

type YellowNetwork = {
  chainId: number;
  name: string;
  custodyAddress: string;
  adjudicatorAddress: string;
};

type YellowAsset = {
  symbol: string;
  address: string;
  decimals: number;
  chainId: number;
};

type YellowConfig = {
  brokerAddress: string;
  networks: YellowNetwork[];
};

// Cache — these don't change at runtime
let cachedConfig: YellowConfig | null = null;
let cachedAssets: YellowAsset[] | null = null;

function getWsUrl(): string {
  const url = process.env.YELLOW_WS_URL;
  if (!url) {
    throw new Error("YELLOW_WS_URL environment variable is not set");
  }
  return url;
}

// sendMessage returns a parsed object, not a string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function yellowRpcQuery(buildMessage: () => string): Promise<any> {
  const client = new Client({ url: getWsUrl() });
  try {
    await client.connect();
    const message = buildMessage();
    return await client.sendMessage(message);
  } finally {
    await client.disconnect();
  }
}

export async function getYellowConfig(): Promise<YellowConfig> {
  if (cachedConfig) return cachedConfig;

  const response = await yellowRpcQuery(() => createGetConfigMessageV2());

  const networks = response.params?.networks;
  if (!networks || networks.length === 0) {
    throw new Error("Yellow get_config returned no networks");
  }

  cachedConfig = {
    brokerAddress: response.params.brokerAddress,
    networks: networks.map(
      (n: {
        chainId: number;
        name: string;
        custodyAddress: string;
        adjudicatorAddress: string;
      }) => ({
        chainId: n.chainId,
        name: n.name,
        custodyAddress: n.custodyAddress,
        adjudicatorAddress: n.adjudicatorAddress,
      }),
    ),
  };

  return cachedConfig;
}

export async function getYellowNetworkByChainId(chainId: number): Promise<YellowNetwork> {
  const config = await getYellowConfig();
  const network = config.networks.find((n) => n.chainId === chainId);
  if (!network) {
    const available = config.networks.map((n) => `${n.name} (${n.chainId})`).join(", ");
    throw new Error(`Yellow does not support chain ${chainId}. Available: ${available}`);
  }
  return network;
}

export async function getYellowSupportedAssets(): Promise<YellowAsset[]> {
  if (cachedAssets) return cachedAssets;

  const response = await yellowRpcQuery(() => createGetAssetsMessageV2());

  const assets = response.params?.assets;
  if (!assets || assets.length === 0) {
    throw new Error("Yellow get_assets returned no assets");
  }

  const parsed: YellowAsset[] = assets.map(
    (a: { token: string; symbol: string; decimals: number; chainId: number }) => ({
      symbol: a.symbol,
      address: a.token,
      decimals: a.decimals,
      chainId: a.chainId,
    }),
  );
  cachedAssets = parsed;

  return parsed;
}

export async function getYellowStablecoinForChain(chainId: number): Promise<YellowAsset> {
  const assets = await getYellowSupportedAssets();
  // Try USDC first, then any USD-pegged token for the chain
  const chainAssets = assets.filter((a) => a.chainId === chainId);
  const usdc = chainAssets.find((a) => a.symbol.toLowerCase() === "usdc");
  if (usdc) return usdc;

  const usdToken = chainAssets.find((a) => a.symbol.toLowerCase().includes("usd"));
  if (usdToken) return usdToken;

  const available = assets.map((a) => `${a.symbol} (chain ${a.chainId})`).join(", ");
  throw new Error(`No USD token for chain ${chainId}. Available: ${available}`);
}

export async function clearYellowConfigCache() {
  cachedConfig = null;
  cachedAssets = null;
}

export async function getYellowContractAddresses(
  chainId: number,
): Promise<{ custody: string; adjudicator: string }> {
  const network = await getYellowNetworkByChainId(chainId);
  return {
    custody: network.custodyAddress,
    adjudicator: network.adjudicatorAddress,
  };
}

export async function getYellowWsUrl(): Promise<string> {
  return getWsUrl();
}
