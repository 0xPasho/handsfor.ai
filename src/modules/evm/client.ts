import { createPublicClient, http, type PublicClient } from "viem";
import { type SupportedChainId, SUPPORTED_CHAINS, getRpcUrl, getDefaultChainId } from "./chains";

const publicClients: Partial<Record<SupportedChainId, PublicClient>> = {};

export function getPublicClient(chainId?: SupportedChainId): PublicClient {
  const cId = chainId || getDefaultChainId();

  if (publicClients[cId]) {
    return publicClients[cId]!;
  }

  const chain = SUPPORTED_CHAINS[cId];
  const client = createPublicClient({
    chain,
    transport: http(getRpcUrl(cId)),
  });

  publicClients[cId] = client as PublicClient;
  return client as PublicClient;
}
