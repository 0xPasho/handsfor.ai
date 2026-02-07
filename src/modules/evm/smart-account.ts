import type { Address } from "viem";
import { getPublicClient } from "./client";
import { getDefaultChainId, type SupportedChainId } from "./chains";

// ERC-4337 SimpleAccountFactory — same address on both Base and Sepolia (deterministic CREATE2)
const SIMPLE_ACCOUNT_FACTORY: Record<SupportedChainId, Address> = {
  8453: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
  11155111: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
};

const FACTORY_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    name: "getAddress",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function getSmartAccountAddressFromEOA(
  eoaAddress: Address,
  chainId?: SupportedChainId,
): Promise<Address> {
  const resolvedChainId = chainId ?? getDefaultChainId();
  const publicClient = getPublicClient(resolvedChainId);
  const factory = SIMPLE_ACCOUNT_FACTORY[resolvedChainId];

  const address = await publicClient.readContract({
    address: factory,
    abi: FACTORY_ABI,
    functionName: "getAddress",
    args: [eoaAddress, 0n],
  });

  return address;
}
