import { base, sepolia } from "viem/chains";
import type { Chain } from "viem";

export type SupportedChainId = 8453 | 11155111;

export const SUPPORTED_CHAINS: Record<SupportedChainId, Chain> = {
  8453: base,
  11155111: sepolia,
};

export const TOKEN_ADDRESSES: Record<SupportedChainId, { USDC: `0x${string}` }> = {
  8453: { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  11155111: { USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
};

export const USDC_DECIMALS = 6;

export function getDefaultChainId(): SupportedChainId {
  const networkMode = process.env.NETWORK_MODE || "testnet";
  return networkMode === "production" ? 8453 : 11155111;
}

export function getRpcUrl(chainId: SupportedChainId): string {
  switch (chainId) {
    case 8453:
      return process.env.BASE_RPC_URL || "https://mainnet.base.org";
    case 11155111:
      return process.env.SEPOLIA_RPC_URL || "https://1rpc.io/sepolia";
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}
