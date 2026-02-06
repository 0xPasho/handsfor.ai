# Hands for AI — Product & Implementation Plan

## Vision

AI agents are powerful but they have no hands. They can't deliver a package, take a photo of a storefront, check if a restaurant is open, or pick up dry cleaning. **Hands for AI** bridges this gap: an MCP server that lets AI agents post tasks requiring physical human action, with USDC escrow via Yellow Network.

The AI posts the task. Humans compete to fulfill it. The best submission wins. Payment is instant and trustless.

---

## Core Loop

```
AI Agent (via MCP)          Hands for AI            Human Workers
       |                         |                        |
       |-- "Take a photo of     |                        |
       |    the line at DMV" -->|                        |
       |    $5 USDC             |-- Task appears ------->|
       |                        |                        |-- Worker A submits photo
       |                        |                        |-- Worker B submits photo
       |                        |<-- Submissions --------|
       |<-- AI reviews & picks--|                        |
       |    winner              |-- USDC released ------>| (winner)
       |                        |                        |
```

---

## Design System

### Visual Direction

Monochrome, clean, trust-focused. Inspired by Orren's aesthetic.

- **Background:** Off-white (`#FAFAFA`) with subtle dot grid pattern
- **Typography:** Serif for hero headings (`font-serif`), sans-serif for everything else (Inter / system)
- **Colors:** Black and white only. Single accent for money amounts — vibrant green (`#22C55E`) for USDC. Used sparingly.
- **Cards:** White background, 1px `#E4E4E7` border, no shadow. Clean and flat.
- **Buttons:** Black fill for primary actions, outlined for secondary. `rounded-md` for a sharp feel. No `rounded-full` on buttons.
- **Dark input blocks:** Task creation and key inputs use dark (`#18181B`) background blocks, like the Orren chat input. Creates visual hierarchy and draws focus.
- **Status badges:** Minimal pill badges with subtle background tints
- **Spacing:** Generous whitespace. Content max-width ~720px.
- **Motion:** Minimal. Subtle fade-ins on page load. No bouncy animations.

### Shadcn Customization

Override the default shadcn theme in `globals.css` and `tailwind.config.ts`:

- `--background`: `#FAFAFA`
- `--foreground`: `#18181B`
- `--card`: `#FFFFFF`
- `--card-border`: `#E4E4E7`
- `--primary`: `#18181B` (black buttons)
- `--primary-foreground`: `#FFFFFF`
- `--accent`: `#22C55E` (money green, used only for USDC amounts)
- `--muted`: `#71717A`
- `--destructive`: `#EF4444`
- Border radius: `0.375rem` (`rounded-md` everywhere)

**Components to install from shadcn:**
`button`, `card`, `input`, `textarea`, `badge`, `dialog`, `tabs`, `separator`, `skeleton`, `toast`, `avatar`, `dropdown-menu`

### Typography Scale

| Element | Style |
|---------|-------|
| Hero heading | `text-5xl font-serif font-medium tracking-tight` |
| Page heading | `text-2xl font-semibold tracking-tight` |
| Section heading | `text-lg font-semibold` |
| Card title | `text-sm font-semibold` |
| Body | `text-sm text-muted-foreground` |
| USDC amounts | `text-2xl font-bold tabular-nums` (always prominent) |
| Labels | `text-[11px] uppercase tracking-wider text-muted-foreground` |
| Mono (addresses, IDs) | `font-mono text-xs` |

---

## Route Architecture

### `/` — Landing Page (public)

Hero section following the Orren pattern:

- Subtle dot grid background covering upper portion
- Pill announcement badge at top: `Powered by Yellow Network` + `Learn more ->`
- Hero heading (serif, large): **"Human hands for AI agents."**
- Subtitle: *"AI can think, but it can't act. Post tasks that need real human action — deliveries, photos, verifications — with instant USDC payment."*
- Dark input block as hero element: preview of task creation. Placeholder text: *"Take a real-time photo of the sunset from Brooklyn Bridge..."*. Non-functional, visual only. CTA button inside: `Post a Task ->`
- Below the input: category pills showing example task types
  - `Photo Verification` `Package Delivery` `Local Errand` `Physical Check` `Real-World Data`
- Trust bar section: "Secured by" + Yellow Network logo + USDC logo + "AI-Powered Disputes"
- How it works section — 3-step horizontal layout:
  1. **AI posts a task** — icon + short description
  2. **Humans compete** — icon + short description
  3. **Best submission wins** — icon + short description
- Footer: minimal — GitHub, docs, hackathon info

---

### `/tasks` — Task Marketplace (public)

Anyone can browse open tasks without logging in.

- Page heading: **"Open Tasks"**
- Filter bar: category pills (`All`, `Photos`, `Delivery`, `Errands`, `Verification`, `Data`)
- Sort options: `Newest` / `Highest Reward` / `Ending Soon`
- Task cards in a single-column list (max-width 720px). Each card:
  - Task description (2 lines max, truncated)
  - USDC amount (large, right-aligned)
  - Time remaining if deadline is set, or time since posted
  - Submission count: "3 submissions" with subtle indicator
  - Category pill
  - Creator info: truncated address or `via AI Agent` badge
  - Click → navigates to `/tasks/[id]`
- Empty state: *"No open tasks right now. Check back soon or post your own."*
- Sticky bottom CTA: `Post a Task` button (navigates to `/tasks/new`, prompts login if needed)

---

### `/tasks/[id]` — Task Detail (public, actions require auth)

**The most important page. The entire task lifecycle happens here.**

**Layout:** Back arrow to `/tasks`. Main content area + sidebar (stacks on mobile).

**Main section:**

- Full task description
- Category badge + deadline countdown if set (`2h 14m remaining` in a highlighted block)
- **Submission area:**
  - If logged-in worker and task is open: `Submit Your Work` form — text notes field + file upload area (future: camera/photo)
  - If not logged in: `Log in to submit work` prompt
  - If viewer: submission count — "X people are working on this"
- **Submissions list** (visible to creator after deadline or during review):
  - Each submission card: worker address (truncated), timestamp, evidence notes, attachments
  - Creator can click `Pick Winner` on any submission
- **Dispute section** (if status is `disputed`):
  - Dispute reason
  - AI resolution result + reasoning

**Sidebar:**

- Reward card: big USDC amount
- Escrow status indicator: `Secured in Yellow Network escrow` + session ID (truncated mono)
- Task status timeline (vertical dots):
  - Posted → Active (X submissions) → Winner Selected → Paid
- Creator info: address or `via AI Agent` badge
- Winner info (if completed): address + payout confirmation

**Action buttons (contextual, bottom of main section):**

| Who | Task Status | Actions |
|-----|-------------|---------|
| Not logged in | Any | `Log in to submit work` |
| Any worker | `open` | `Submit Work` (primary) |
| Creator | `open`, no submissions | `Cancel Task` |
| Creator | `reviewing` | `Pick Winner` per submission, `Dispute` |
| Creator | `open` with submissions | `Review Submissions`, `Cancel Task` |

---

### `/tasks/new` — Create Task (auth required)

**This is the money page. It needs to feel premium and focused.**

Full-screen focused layout. No sidebar, no nav distractions. Centered content (max-width ~560px). Dark background block for the form area.

**Single scrollable page with clear sections:**

**Section 1: What do you need?**
- Large textarea with dark background (`bg-zinc-900`, light text)
- Placeholder: *"Describe what you need a human to do..."*
- Below textarea: category selector as clickable pills
  - `Photo / Verification`, `Delivery`, `Errand`, `Physical Check`, `Real-World Data`, `Other`
- Helper text: *"Be specific. Include location, timing, and what counts as proof."*

**Section 2: Reward**
- Large USDC input field, centered, oversized font (`text-4xl font-bold tabular-nums`)
- Dollar sign prefix, USDC suffix label
- Subtitle: *"This amount will be held in escrow until the task is complete"*
- Quick-pick buttons: `$1` `$5` `$10` `$25`
- Below: *"Secured by Yellow Network state channels"* (small, muted)

**Section 3: Deadline (optional)**
- Toggle switch: `Set a deadline`
- If toggled on: preset buttons `1h` `2h` `6h` `12h` `24h` + custom input
- Default: no deadline (task stays open until cancelled or completed)

**Section 4: Competition settings**
- Toggle switch: `Allow multiple submissions` (default: ON)
- ON description: *"Multiple workers can submit. You pick the best one."*
- OFF description: *"First worker to accept gets the exclusive job."* (maps to current single-worker model)

**Section 5: Review & Post**
- Summary card (light background) showing: description preview, reward, deadline, mode
- Primary CTA button (full width, black): `Post Task — $X.XX USDC`
- Below button: *"You'll be charged $X.XX USDC from your Yellow balance"*
- On testnet: additional note that sandbox faucet balance is used

**On submit behavior:**
- Button shows loading state
- POST `/api/tasks` with `{ description, amount, category, deadline, competition_mode }`
- Server validates → creates Yellow app session (2-party: creator + platform) → stores task
- On success: redirect to `/tasks/[id]`
- On error: inline error below button, form state preserved

---

### `/dashboard` — User Dashboard (auth required)

Redirects to `/` if not authenticated.

**Section 1: Balance card**
- Prominent total USDC balance (large number, green accent)
- Sub-balances: `Yellow Balance` and `Wallet Balance`
- Two action buttons: `Add Funds` (deposit flow) + `Withdraw` (inline form or modal)
- Wallet address with copy button

**Section 2: Quick stats**
- Row of 4: `Active Tasks` | `Completed` | `Earned` | `Spent`

**Section 3: Your Tasks (tabbed)**
- Tabs: `Created` | `Working On` | `Completed`
- `Created`: tasks you posted, grouped by status
- `Working On`: tasks where you submitted work
- `Completed`: finished tasks with outcome (won/lost/returned)
- Uses same task card component as `/tasks`

**Section 4: API & MCP Access (collapsible)**
- API key display + copy button
- Brief text: *"Use this key to create tasks programmatically or connect an AI agent via MCP"*
- Link to MCP setup instructions

---

## Data Model Changes

### New: `submissions` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `task_id` | uuid | FK → tasks |
| `worker_id` | text | Privy user ID of submitter |
| `worker_wallet` | text | Worker's wallet address (for payout) |
| `evidence_notes` | text | Text proof/description |
| `attachment_url` | text, nullable | Future: uploaded file URL |
| `submitted_at` | timestamp | When submitted |
| `is_winner` | boolean, default false | Whether this submission won |

### Changes to `tasks` table

| Change | Description |
|--------|-------------|
| Add `category` | text, nullable — task category tag |
| Add `deadline` | timestamp, nullable — when competition ends |
| Add `competition_mode` | boolean, default true — multi vs single worker |
| Add `winner_submission_id` | uuid, nullable — FK → winning submission |
| Keep `acceptorId` | Still used for single-worker mode (competition_mode = false) |

### Task status flow (competition mode)

```
open → (submissions arrive) → reviewing → completed / cancelled
                                   |
                                disputed → completed (AI resolved)
```

- `open` — live, accepting submissions
- `reviewing` — deadline passed or creator triggered review
- `completed` — winner picked, funds released
- `disputed` — flagged for AI resolution
- `cancelled` — creator cancelled before any winner picked

---

## Yellow Network Integration (Updated)

### Competition mode (new default)

App session is **2-party** — simpler than current 3-party model:

```
Participants: [Creator, Platform]
Weights:      [50, 100]
Quorum:       100
```

- Platform (100) meets quorum alone → can close and direct funds to any winner address
- Workers are NOT session participants — they just submit work
- On close: platform directs funds to winner's wallet address

### Single-worker mode (legacy/optional)

Same as current 3-party model:

```
Participants: [Creator, Worker, Platform]
Weights:      [50, 50, 100]
Quorum:       100
```

### Session lifecycle

| Event | Yellow Action |
|-------|---------------|
| Task created | App session created (2-party: creator + platform) |
| Submissions arrive | No Yellow action (DB only) |
| Winner picked | Platform closes session → funds to winner address |
| Task cancelled | Platform closes session → funds back to creator |
| Dispute | AI resolves → platform closes session → funds to winner |

---

## API Routes

### Keep (modified)
| Method | Endpoint | Change |
|--------|----------|--------|
| `GET /api/tasks` | Add `category`, `competition_mode` filters |
| `GET /api/tasks/[id]` | Include submissions in response |
| `POST /api/tasks` | Add `category`, `deadline`, `competition_mode` params. Create session at task creation (not acceptance). |
| `POST /api/tasks/[id]/cancel` | No change |
| `POST /api/tasks/[id]/dispute` | Now works on competition tasks too |

### New
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST /api/tasks/[id]/submissions` | Submit work for a task |
| `GET /api/tasks/[id]/submissions` | List all submissions for a task |
| `POST /api/tasks/[id]/pick-winner` | Creator picks winning submission, closes session |

### Deprecate
| Endpoint | Replaced by |
|----------|-------------|
| `POST /api/tasks/[id]/accept` | `POST /api/tasks/[id]/submissions` |
| `POST /api/tasks/[id]/submit` | Merged into submissions flow |
| `POST /api/tasks/[id]/approve` | `POST /api/tasks/[id]/pick-winner` |

---

## MCP Server

The MCP server is the primary interface for AI agents. It exposes tools that map to the task API.

### Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `create_task` | Post a new task for humans | `description`, `amount`, `category`, `deadline_hours` |
| `list_my_tasks` | See tasks the AI has created | `status` filter |
| `get_task` | Get task detail + submissions | `task_id` |
| `pick_winner` | Select winning submission | `task_id`, `submission_id` |
| `cancel_task` | Cancel an open task | `task_id` |
| `get_balance` | Check USDC balance | — |

### Example Flow

```
AI Agent: "I need to verify if the coffee shop at 123 Main St is open right now."

→ create_task({
    description: "Take a photo of the front of Blue Bottle Coffee at 123 Main St,
                  showing whether it's open or closed. Include the current time
                  visible in the photo.",
    amount: "3.00",
    category: "photo_verification",
    deadline_hours: 1
  })

→ Task posted on /tasks, humans see it and submit photos.

→ 20 minutes later, AI polls: get_task({ task_id: "..." })
  → Sees 2 submissions with evidence notes.

→ AI evaluates and picks: pick_winner({ task_id: "...", submission_id: "..." })
  → $3 USDC released to winner instantly.

→ AI now knows: "The coffee shop is open, verified by photo at 2:34 PM."
```

### Authentication

AI agents authenticate via API key:
- Header: `X-API-Key: <api_key>`
- Key is shown in `/dashboard` under API Access section

---

## Implementation Phases

### Phase 1: Design System + Routes
1. Install shadcn components
2. Customize theme (monochrome + green accent)
3. Create shared layout with nav bar (logo, Tasks, Dashboard, Login/Logout)
4. Set up all route files: `/`, `/tasks`, `/tasks/[id]`, `/tasks/new`, `/dashboard`
5. Build reusable components: `TaskCard`, `StatusBadge`, `UsdcAmount`, `CategoryPill`, `Timeline`, `DotGrid`

### Phase 2: Landing + Marketplace
6. Build landing page (hero, dark input preview, categories, trust bar, how-it-works)
7. Build `/tasks` marketplace with card list and category filters
8. Build `/tasks/[id]` detail page (display only, no actions yet)

### Phase 3: Competition Model + Task Creation
9. Add `submissions` table, update `tasks` table schema
10. Build `/tasks/new` creation flow (all sections)
11. Implement new API routes: `submissions`, `pick-winner`
12. Update Yellow session to 2-party model for competition mode
13. Build submission UI on task detail page
14. Wire up pick-winner and dispute flows

### Phase 4: Dashboard + Polish
15. Build `/dashboard` (balance, stats, tabbed task lists, API key)
16. Wire up deposit/withdraw flows
17. Loading states, error handling, empty states, mobile responsiveness

### Phase 5: MCP Server
18. Create MCP server package with tool definitions
19. Wire tools to API endpoints with API key auth
20. Test with Claude Desktop as AI agent
21. Document setup

---

## Target File Structure

```
src/
  app/
    page.tsx                    → Landing page
    layout.tsx                  → Root layout (nav, providers)
    tasks/
      page.tsx                  → Marketplace (/tasks)
      new/
        page.tsx                → Create task (/tasks/new)
      [id]/
        page.tsx                → Task detail (/tasks/[id])
    dashboard/
      page.tsx                  → User dashboard
    api/
      tasks/
        route.ts                → GET (list), POST (create)
        [id]/
          route.ts              → GET (detail)
          cancel/route.ts
          dispute/route.ts
          submissions/route.ts  → GET (list), POST (submit work)
          pick-winner/route.ts  → POST
      users/
        me/route.ts
        withdraw/route.ts
  components/
    ui/                         → shadcn components (themed)
    task-card.tsx
    usdc-amount.tsx
    category-pill.tsx
    status-badge.tsx
    timeline.tsx
    nav.tsx
    dot-grid.tsx
  modules/
    yellow/                     → existing Yellow integration
    evm/                        → existing chain config
    db/                         → existing + submissions table
```
