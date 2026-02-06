import { createPublicClient, http, namehash, type Address } from "viem";
import { mainnet, base } from "viem/chains";
import { normalize } from "viem/ens";

type ResolvedIdentity = { name: string; avatar: string | null } | null;

// Singleton clients
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.MAINNET_RPC_URL || "https://eth.llamarpc.com"),
});

const baseClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;
const registryAbi = [
  {
    inputs: [{ type: "bytes32" }],
    name: "owner",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Resolve ENS name for an address.
 * 1. Try reverse resolution (primary name) — instant if set
 * 2. Fallback: query ENS subgraph for names owned by this address,
 *    then verify via forward resolution
 */
export async function resolveEns(address: Address): Promise<ResolvedIdentity> {
  // 1. Try reverse resolution (primary name)
  try {
    const name = await mainnetClient.getEnsName({ address });
    if (name) {
      let avatar: string | null = null;
      try {
        avatar = await mainnetClient.getEnsAvatar({ name: normalize(name) });
      } catch {
        // avatar resolution can fail
      }
      return { name, avatar };
    }
  } catch {
    // reverse failed, try fallback
  }

  // 2. Fallback: query ENS subgraph for names owned by this address
  try {
    const response = await fetch("https://api.thegraph.com/subgraphs/name/ensdomains/ens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          domains(where: { owner: "${address.toLowerCase()}" }, first: 5, orderBy: createdAt, orderDirection: desc) {
            name
            resolvedAddress { id }
          }
        }`,
      }),
    });
    const data = await response.json();
    const domains = data?.data?.domains as Array<{ name: string; resolvedAddress?: { id: string } }> | undefined;
    if (domains && domains.length > 0) {
      // Find a .eth name that forward-resolves to this address (or just the first one owned)
      for (const domain of domains) {
        if (!domain.name || !domain.name.endsWith(".eth")) continue;
        // Verify ownership via registry
        try {
          const owner = await mainnetClient.readContract({
            address: ENS_REGISTRY,
            abi: registryAbi,
            functionName: "owner",
            args: [namehash(domain.name)],
          });
          if (owner.toLowerCase() === address.toLowerCase()) {
            let avatar: string | null = null;
            try {
              avatar = await mainnetClient.getEnsAvatar({ name: normalize(domain.name) });
            } catch {
              // avatar can fail
            }
            return { name: domain.name, avatar };
          }
        } catch {
          // skip this domain
        }
      }
    }
  } catch {
    // subgraph fallback failed
  }

  return null;
}

export async function resolveBaseName(address: Address): Promise<ResolvedIdentity> {
  try {
    const name = await baseClient.getEnsName({
      address,
      universalResolverAddress: "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD",
    });
    if (!name) return null;
    let avatar: string | null = null;
    try {
      avatar = await baseClient.getEnsAvatar({
        name: normalize(name),
        universalResolverAddress: "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD",
      });
    } catch {
      // avatar resolution can fail
    }
    return { name, avatar };
  } catch {
    return null;
  }
}

export async function resolveAllIdentities(address: Address) {
  const [ens, baseName] = await Promise.all([
    resolveEns(address),
    resolveBaseName(address),
  ]);
  return { ens, baseName };
}
