"use client";

import { useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { sepolia, base } from "viem/chains";

const NETWORK_MODE = process.env.NEXT_PUBLIC_NETWORK_MODE || "testnet";
const chain = NETWORK_MODE === "production" ? base : sepolia;

export function useAuth() {
  const { ready, authenticated, login, logout, getAccessToken, user } =
    usePrivy();
  const { wallets } = useWallets();

  const getToken = useCallback(async () => {
    return await getAccessToken();
  }, [getAccessToken]);

  const getWalletClient = useCallback(async () => {
    const wallet = wallets[0];
    if (!wallet) throw new Error("No wallet connected");
    await wallet.switchChain(chain.id);
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({
      account: wallet.address as `0x${string}`,
      chain,
      transport: custom(provider),
    });
  }, [wallets]);

  return {
    ready,
    authenticated,
    login,
    logout,
    getToken,
    getWalletClient,
    wallets,
    user,
    walletAddress: user?.wallet?.address,
    networkMode: NETWORK_MODE,
    chain,
  };
}
