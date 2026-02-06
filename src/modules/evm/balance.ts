import type { Address } from "viem";
import { formatUnits } from "viem";
import { getPublicClient } from "./client";
import { TOKEN_ADDRESSES, USDC_DECIMALS, getDefaultChainId } from "./chains";
import type { SupportedChainId } from "./chains";

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function getUsdcBalance(address: string, chainId?: SupportedChainId): Promise<string> {
  try {
    const cId = chainId || getDefaultChainId();
    const publicClient = getPublicClient(cId);
    const usdcAddress = TOKEN_ADDRESSES[cId].USDC;

    const balance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    });

    return formatUnits(balance, USDC_DECIMALS);
  } catch (error) {
    console.error("Error getting USDC balance:", error);
    return "0";
  }
}
