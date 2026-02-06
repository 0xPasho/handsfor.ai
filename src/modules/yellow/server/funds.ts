import { Client } from "yellow-ts";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import {
  NitroliteClient,
  WalletStateSigner,
  type ContractAddresses,
} from "@erc7824/nitrolite";
import { createWalletClient, createPublicClient, http, parseUnits, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, sepolia } from "viem/chains";
import { serverData } from "@/modules/general/utils/server-constants";
import { getYellowContractAddresses, getYellowSupportedAssets } from "../config";
import { getDefaultChainId, TOKEN_ADDRESSES, USDC_DECIMALS } from "@/modules/evm/chains";
import { ensureUserYellowSession } from "./user-auth";
import { createAndFundChannel } from "./channel";
import type { YellowConnection } from "../types";

const authPrivateKey = serverData.environment.PRIVY_AUTHORIZATION_PRIVATE_KEY;

/**
 * Request test tokens from the Yellow sandbox faucet.
 * Credits ytest.usd to the user's unified balance (off-chain).
 * Only works on testnet/sandbox.
 */
export async function requestSandboxFaucet(walletAddress: string): Promise<void> {
  if (!serverData.isTestnet) return;

  const wsUrl = serverData.environment.YELLOW_WS_URL;
  // Derive faucet URL from WS URL (e.g. wss://clearnet-sandbox.yellow.com/ws -> https://clearnet-sandbox.yellow.com)
  const baseUrl = wsUrl.replace("wss://", "https://").replace("/ws", "");

  const res = await fetch(`${baseUrl}/faucet/requestTokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userAddress: walletAddress }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`Sandbox faucet request failed (${res.status}): ${text}`);
  }
}


const privy = new PrivyClient({
  appId: serverData.environment.PRIVY_APP_ID,
  appSecret: serverData.environment.PRIVY_APP_SECRET,
});

function getChain() {
  return serverData.isTestnet ? sepolia : base;
}

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Transfer USDC from platform wallet to a user's server wallet.
 */
async function transferUsdcToUser(
  userAddress: string,
  amount: string,
): Promise<string> {
  const chainId = getDefaultChainId();
  const chain = getChain();
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

  const amountInUnits = parseUnits(amount, USDC_DECIMALS);
  const usdcAddress = TOKEN_ADDRESSES[chainId].USDC;

  const txHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [userAddress as Address, amountInUnits],
  });

  // Wait for confirmation so balance is available for the next step
  const receipt = await publicClient.waitForTransactionReceipt({ timeout: 120_000, hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`USDC transfer to user failed: ${txHash}`);
  }
  console.log(`[Transfer] Sent ${amount} USDC to ${userAddress}: ${txHash}`);

  return txHash;
}

function createNitroliteClient(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  contracts: { custody: string; adjudicator: string },
  chainId: number,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NitroliteClient({
    walletClient: walletClient as any,
    publicClient: publicClient as any,
    stateSigner: new WalletStateSigner(walletClient as any),
    addresses: contracts as ContractAddresses,
    chainId,
    challengeDuration: 3600n,
  });
}

/**
 * Deposit tokens from a user's server wallet into Yellow custody contract.
 * Uses the Yellow-supported token address (which may differ from chain USDC on testnet).
 * Handles approve + deposit manually for better error reporting.
 */
async function depositToCustody(
  privyWalletId: string,
  walletAddress: string,
  amount: string,
  tokenAddress: Address,
  tokenDecimals: number,
): Promise<string> {
  const chainId = getDefaultChainId();
  const chain = getChain();
  const contracts = await getYellowContractAddresses(chainId);

  const account = await createViemAccount(privy, {
    walletId: privyWalletId,
    address: walletAddress as `0x${string}`,
    authorizationContext: {
      authorization_private_keys: [authPrivateKey],
    },
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  const amountInUnits = parseUnits(amount, tokenDecimals);
  const custodyAddress = contracts.custody as Address;

  // Check on-chain token balance before proceeding
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress as Address],
  });
  console.log(`[Deposit] Token ${tokenAddress} balance for ${walletAddress}: ${balance} (need ${amountInUnits})`);

  if (balance < amountInUnits) {
    throw new Error(
      `Insufficient token balance: have ${balance}, need ${amountInUnits}. ` +
      `Wallet ${walletAddress} needs token ${tokenAddress} on chain ${chainId}.`,
    );
  }

  // Check and set allowance manually (better error reporting than NitroliteClient)
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [walletAddress as Address, custodyAddress],
  });
  console.log(`[Deposit] Current allowance for custody ${custodyAddress}: ${allowance}`);

  if (allowance < amountInUnits) {
    console.log(`[Deposit] Approving ${amountInUnits} for custody contract...`);
    const approveHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [custodyAddress, amountInUnits],
    });
    const approveReceipt = await publicClient.waitForTransactionReceipt({ timeout: 120_000, hash: approveHash });
    if (approveReceipt.status !== "success") {
      throw new Error(`Token approve transaction failed: ${approveHash}`);
    }
    console.log(`[Deposit] Approve confirmed: ${approveHash}`);
  }

  // Now deposit — allowance is already set so NitroliteClient will skip its approve step
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nitroliteClient = createNitroliteClient(walletClient, publicClient as any, contracts, chainId);
  const depositHash = await nitroliteClient.deposit(tokenAddress, amountInUnits);

  const receipt = await publicClient.waitForTransactionReceipt({ timeout: 120_000, hash: depositHash });
  if (receipt.status !== "success") {
    throw new Error(`Deposit transaction failed: ${depositHash}`);
  }

  return depositHash;
}

/**
 * Send a small amount of ETH from the platform wallet to a user's server wallet
 * so it can pay gas for custody contract interactions (deposit/withdraw).
 */
async function sponsorGas(userAddress: string): Promise<void> {
  const chain = getChain();
  const platformKey = serverData.environment.PLATFORM_WALLET_PRIVATE_KEY as Hex;
  const platformAccount = privateKeyToAccount(platformKey);

  const publicClient = createPublicClient({ chain, transport: http() });

  // Check if user already has enough ETH for gas (~0.002 ETH covers deposit + approve)
  const balance = await publicClient.getBalance({ address: userAddress as Address });
  const minGasBalance = parseUnits("0.002", 18);
  if (balance >= minGasBalance) {
    console.log(`[Gas Sponsor] ${userAddress} already has sufficient ETH`);
    return;
  }

  const walletClient = createWalletClient({
    account: platformAccount,
    chain,
    transport: http(),
  });

  const sponsorAmount = parseUnits("0.005", 18); // ~0.005 ETH for multiple operations
  const txHash = await walletClient.sendTransaction({
    to: userAddress as Address,
    value: sponsorAmount,
  });

  await publicClient.waitForTransactionReceipt({ timeout: 120_000, hash: txHash });
  console.log(`[Gas Sponsor] Sent 0.005 ETH to ${userAddress}: ${txHash}`);
}

/**
 * Look up the USD token that Yellow uses for channels on the current chain.
 * On sandbox this is a Yellow-specific test token (not the real chain USDC).
 */
async function getYellowUsdToken() {
  const assets = await getYellowSupportedAssets();
  const usdAsset = assets.find((a) => a.symbol.toLowerCase() === "usdc")
    || assets.find((a) => a.symbol.toLowerCase().includes("usd"));
  if (!usdAsset) {
    throw new Error("No USD token found in Yellow supported assets");
  }
  return usdAsset;
}

/**
 * Testnet deposit flow: use the Yellow sandbox faucet to credit off-chain
 * ledger balance. No on-chain deposit or channel needed — the sandbox
 * token (ytest.usd) has no public mint, so on-chain custody is not possible.
 */
export async function depositAndAllocateForUserTestnet(params: {
  userId: string;
  privyWalletId: string;
  walletAddress: string;
  amount: string;
}): Promise<void> {
  console.log(`[Testnet Deposit] Requesting sandbox faucet for ${params.walletAddress}`);
  await requestSandboxFaucet(params.walletAddress);
}

/**
 * Shared helper: connect to Yellow, authenticate, create a channel, and allocate funds.
 * Used by both testnet and production deposit flows.
 */
async function createChannelAndAllocate(
  params: {
    userId: string;
    privyWalletId: string;
    walletAddress: string;
    amount: string;
  },
  yellowToken?: { symbol: string; address: string; decimals: number },
): Promise<void> {
  const chainId = getDefaultChainId();
  const chain = getChain();
  const contracts = await getYellowContractAddresses(chainId);

  const usdAsset = yellowToken ?? await getYellowUsdToken();

  // Create user's wallet + NitroliteClient for on-chain channel operations
  const account = await createViemAccount(privy, {
    walletId: params.privyWalletId,
    address: params.walletAddress as `0x${string}`,
    authorizationContext: {
      authorization_private_keys: [authPrivateKey],
    },
  });

  const walletClient = createWalletClient({ account, chain, transport: http() });
  const publicClient = createPublicClient({ chain, transport: http() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nitroliteClient = createNitroliteClient(walletClient, publicClient as any, contracts, chainId);

  const client = new Client({ url: serverData.environment.YELLOW_WS_URL });
  await client.connect();

  try {
    const session = await ensureUserYellowSession({
      userId: params.userId,
      privyWalletId: params.privyWalletId,
      walletAddress: params.walletAddress as Address,
      allowance: params.amount,
      yellowClient: client,
    });

    const conn: YellowConnection = {
      client,
      sessionSigner: session.messageSigner,
      sessionKeyAddress: session.sessionKeyAddress,
      walletAddress: params.walletAddress as Address,
    };

    const result = await createAndFundChannel(conn, usdAsset.address, params.amount, nitroliteClient);
    if (!result.success) {
      throw new Error(`Channel funding failed: ${result.error}`);
    }
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}

/**
 * Testnet withdrawal: sponsor gas, withdraw from custody, then transfer USDC
 * to the destination address. Platform pays gas via sponsorship.
 */
export async function withdrawFromYellowTestnet(params: {
  privyWalletId: string;
  walletAddress: string;
  amount: string;
  destinationAddress: string;
}): Promise<{ txHash: string }> {
  // Sponsor gas so user's server wallet can call custody withdrawal
  await sponsorGas(params.walletAddress);

  // Withdraw from custody + transfer to destination (same as production)
  return withdrawFromYellow(params);
}

/**
 * Full flow for x402: transfer USDC from platform wallet to user's server wallet,
 * deposit to Yellow custody, create/fund channel, and authenticate with Yellow.
 * Use this when USDC has arrived at the platform wallet via x402 payment.
 */
export async function depositAndAllocateForUser(params: {
  userId: string;
  privyWalletId: string;
  walletAddress: string;
  amount: string;
}): Promise<void> {
  const yellowToken = await getYellowUsdToken();

  // Step 1: Transfer USDC from platform wallet to user's server wallet
  await transferUsdcToUser(params.walletAddress, params.amount);

  // Step 2: Deposit token from user's server wallet to Yellow custody
  await depositToCustody(
    params.privyWalletId,
    params.walletAddress,
    params.amount,
    yellowToken.address as Address,
    yellowToken.decimals,
  );

  // Step 3: Create channel and allocate deposited funds via Yellow
  await createChannelAndAllocate(params, yellowToken);
}


/**
 * Withdraw USDC from Yellow to an external address.
 * Withdraw from custody -> transfer out from server wallet.
 */
export async function withdrawFromYellow(params: {
  privyWalletId: string;
  walletAddress: string;
  amount: string;
  destinationAddress: string;
}): Promise<{ txHash: string }> {
  const chainId = getDefaultChainId();
  const chain = getChain();
  const contracts = await getYellowContractAddresses(chainId);

  const account = await createViemAccount(privy, {
    walletId: params.privyWalletId,
    address: params.walletAddress as `0x${string}`,
    authorizationContext: {
      authorization_private_keys: [authPrivateKey],
    },
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nitroliteClient = createNitroliteClient(walletClient, publicClient as any, contracts, chainId);

  const usdcAddress = TOKEN_ADDRESSES[chainId].USDC;
  const amountInUnits = parseUnits(params.amount, USDC_DECIMALS);

  // Withdraw from custody
  const withdrawHash = await nitroliteClient.withdrawal(usdcAddress, amountInUnits);
  const receipt = await publicClient.waitForTransactionReceipt({ timeout: 120_000, hash: withdrawHash });
  if (receipt.status !== "success") {
    throw new Error(`Withdraw transaction failed: ${withdrawHash}`);
  }

  // Transfer USDC from server wallet to external address
  const txHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: [
      {
        name: "transfer",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ],
    functionName: "transfer",
    args: [params.destinationAddress as `0x${string}`, amountInUnits],
  });

  return { txHash };
}
