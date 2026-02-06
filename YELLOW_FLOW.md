# Yellow Network Integration

## Overview

Tasks are funded via Yellow Network state channels. Users deposit USDC, which flows through Yellow's custody and channel system into off-chain app sessions where payments happen instantly.

## Two Environments

### Testnet (Sepolia)

Uses Yellow's sandbox with off-chain faucet. No on-chain deposit possible because the sandbox token (`ytest.usd` at `0xDB9F...`) is a PremintERC20 with no public mint — the entire supply is held by Yellow.

**Flow:** Faucet → Ledger balance → App session

1. `requestSandboxFaucet` credits `ytest.usd` to user's off-chain Yellow balance
2. Any leftover on-chain channels are auto-closed (cleanup from previous runs)
3. App session created directly against ledger balance

### Production (Base)

Uses x402 HTTP payments. USDC arrives at platform wallet, gets deposited on-chain into Yellow custody, then allocated to unified balance via state channels.

**Flow:** x402 payment → Platform wallet → User wallet → Custody → Channel → Unified balance → App session

1. x402 facilitator verifies payment, USDC lands on platform wallet
2. Platform transfers USDC to user's Privy server wallet
3. User wallet approves + deposits USDC into Yellow custody contract
4. Channel created (or reused) via Yellow RPC + on-chain execution
5. Channel resized: `resize_amount` (custody→channel) + `allocate_amount` (channel→unified balance)
6. App session created with funds from unified balance

## Key Decisions

- **Testnet uses faucet, not on-chain deposits.** Yellow's sandbox token has no public mint, so we can't do the full on-chain flow. The faucet credits off-chain balance directly.
- **Manual approve before NitroliteClient.deposit().** The SDK's deposit method swallows the original error in its approve catch block. We check balance, set allowance manually, then call deposit (which skips its own approve since allowance is already set).
- **Token address comes from Yellow API, not hardcoded.** On sandbox, Yellow uses `ytest.usd` (`0xDB9F...`), not real Sepolia USDC (`0x1c7D...`). Production uses real USDC on Base. `getYellowSupportedAssets()` returns the correct token.
- **Platform sponsors gas on testnet.** Privy server wallets start with 0 ETH. Platform sends ~0.005 ETH for contract interactions.
- **Channel reuse.** If an open channel exists, we reuse it instead of creating a new one (Yellow only allows one per wallet).

## Wallets

| Wallet | How | Purpose |
|--------|-----|---------|
| User server wallet | Privy `createViemAccount` | On-chain ops (deposit, channel, withdraw) |
| Platform wallet | Direct private key | Gas sponsorship (testnet), USDC relay (x402) |

## Files

- `yellow/server/funds.ts` — Deposit/withdraw flows, gas sponsorship, custody interactions
- `yellow/server/channel.ts` — Channel create, resize, list operations (Yellow RPC + on-chain)
- `yellow/server/platform.ts` — App sessions (create, transition, close), platform auth, channel cleanup
- `yellow/server/client.ts` — Yellow WebSocket connection, off-chain transfers
- `yellow/config.ts` — Yellow API queries (config, assets, contract addresses)
- `yellow/currency.ts` — `ytest.usd` (testnet) vs `usdc` (production)
