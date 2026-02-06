import type { Address } from "viem";
import { getPublicClient } from "./client";
import type { SupportedChainId } from "./chains";

const SIMPLE_ACCOUNT_FACTORY = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985" as const;

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
  const publicClient = getPublicClient(chainId);

  const address = await publicClient.readContract({
    address: SIMPLE_ACCOUNT_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getAddress",
    args: [eoaAddress, 0n],
  });

  return address;
}
