# Just Platform - Implementation Plan

## Overview

A task marketplace where users create tasks (paying via x402) and other users accept and complete them. Funds are managed via Yellow Network state channels. All users have server-controlled Privy wallets for signing.

---

## Core Concepts

### Users
- Everyone is a **user** identified by a Privy server wallet
- **Task Creator** = user who pays to create a task
- **Task Acceptor** = user who accepts and completes a task
- Same user can be both (on different tasks)
- Authentication: Privy Bearer token (web), API key, or wallet signature (API)

### Wallets
- Each user gets a **Privy server wallet** (backend-controlled)
- No embedded wallets (browser-side) — `createOnLogin: "off"`
- x402 users also get server wallets (app-owned)
- All Yellow signing happens server-side
- Users can withdraw to external wallets

### Yellow Network
- State channels for off-chain USDC transfers
- App Sessions manage task escrow (created at accept time, NOT creation time)
- **Cannot dynamically add participants** — sessions must be created with all participants
- Platform acts as arbiter (weight 100, quorum 100) — can act unilaterally
- Intermediate steps (submit evidence, approve) are DB-only — Yellow only involved at session open/close

---

## Yellow App Session Lifecycle

**Session created when task is ACCEPTED (not created):**

```
Participants: [Creator, Acceptor, Platform]
Weights: [50, 50, 100]
Quorum: 100
```

- Platform (100) alone meets quorum — can close unilaterally
- Creator (50) + Acceptor (50) = 100, also meets quorum
- Neither Creator nor Acceptor can act alone

**Session closed when task is COMPLETED:**
- Approve: Platform closes → all funds to Acceptor
- Dispute resolved: Platform closes → funds to winner

**No session exists for open/cancelled tasks.**

---

## Funds Flow

### Task Creation (x402)
1. x402 payment → USDC lands in platform wallet
2. Platform transfers USDC to creator's server wallet
3. Creator's server wallet deposits to Yellow custody (on-chain)
4. Creator authenticated with Yellow (EIP-712 via Privy signTypedData)

### Task Acceptance
1. Acceptor authenticated with Yellow
2. Platform creates 3-party app session
3. Creator's funds locked in session

### Task Completion
1. Platform signs close message (weight 100 >= quorum 100)
2. Funds allocated to winner in Yellow ledger

### Withdrawal
1. Withdraw from Yellow custody (on-chain)
2. Transfer USDC from server wallet to external address

---

## Schema

### users table
```sql
- id: uuid PK
- walletAddress: text (server wallet address) UNIQUE
- privyWalletId: text (Privy server wallet ID)
- privyUserId: text (Privy user ID, null for x402-only users)
- apiKey: text UNIQUE
- balance: numeric (legacy tracking)
- createdAt: timestamp
```

### tasks table
```sql
- id: uuid PK
- creatorId: uuid FK(users.id)
- acceptorId: uuid FK(users.id), nullable
- appSessionId: text (Yellow app session ID), nullable
- amount: numeric
- status: text (open, in_progress, submitted, disputed, completed, cancelled)
- description: text, nullable
- evidenceNotes: text, nullable
- disputeReason: text, nullable
- resolution: text ('creator_wins' | 'acceptor_wins'), nullable
- createdAt: timestamp
- acceptedAt: timestamp, nullable
- submittedAt: timestamp, nullable
- completedAt: timestamp, nullable
```

---

## API Endpoints

### Authentication
- **Privy Bearer token**: `Authorization: Bearer <token>` (web users)
- **API key**: `X-API-Key: sk_xxx` (API users)
- **Signature**: `X-Signature` + `X-Timestamp` + `X-User-Id` (API users)

### User Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/me` | Privy | Get/create user with server wallet |
| POST | `/api/users/withdraw` | Any | Withdraw USDC to external address |

### Task Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/tasks` | x402 | Create task with payment |
| GET | `/api/tasks` | None | List tasks (filter: status, creator, acceptor) |
| GET | `/api/tasks/:id` | None | Get task details |
| POST | `/api/tasks/:id/accept` | Any | Accept open task (creates Yellow session) |
| POST | `/api/tasks/:id/cancel` | Any | Cancel open task (creator only) |
| POST | `/api/tasks/:id/submit` | Any | Submit evidence (acceptor only, DB-only) |
| POST | `/api/tasks/:id/approve` | Any | Approve work (creator only, closes Yellow) |
| POST | `/api/tasks/:id/dispute` | Any | Dispute work (creator only, AI resolves, closes Yellow) |

---

## Task Status Flow

```
open ──────────► in_progress ──────────► submitted
  │                                          │
  │                                    ┌─────┴─────┐
  │                                    ▼           ▼
  ▼                                disputed   completed
cancelled                              │      (approved)
                                       ▼
                                  completed
                                  (resolved)
```

---

## SDK Functions Used

### From `@erc7824/nitrolite`
- `createAuthRequestMessage` / `createAuthVerifyMessage` — authentication
- `createEIP712AuthMessageSigner` — EIP-712 signing for auth challenge
- `createECDSAMessageSigner` — session key signer for messages
- `createAppSessionMessage` — create app session
- `createCloseAppSessionMessage` — close with final allocations
- `createCreateChannelMessage` — create payment channel
- `NitroliteClient` — on-chain deposit/withdraw/channel operations

### From `yellow-ts`
- `Client` — WebSocket connection

### From `@privy-io/node`
- `privy.wallets().create()` — create server wallet
- `privy.wallets().ethereum().signTypedData()` — sign EIP-712

### From `@privy-io/node/viem`
- `createViemAccount()` — viem-compatible account backed by Privy

---

## Environment Variables

```env
DATABASE_URL=...
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
NEXT_PUBLIC_PRIVY_APP_ID=...
PLATFORM_WALLET_ADDRESS=...
PLATFORM_WALLET_PRIVATE_KEY=...
YELLOW_WS_URL=wss://clearnet-sandbox.yellow.com/ws
NETWORK_MODE=testnet
OPENROUTER_API_KEY=... # For AI dispute resolution
```
