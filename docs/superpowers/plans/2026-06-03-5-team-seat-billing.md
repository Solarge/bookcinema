# Sub-project #5 — Team-Seat Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Bill organization workspaces **per seat**. A seat = one member of an organization workspace. The Stripe subscription `quantity` tracks the member count and is synced whenever membership changes (accept-invite, member removal). Free orgs are capped at 1 seat (the owner) — inviting requires a paid plan.

## Seat model (the key product decision — adjustable)
- **Seat = each member** in an `organization` workspace. Personal workspaces are always 1 seat.
- **Per-seat pricing:** the pro/studio Stripe prices are charged **per unit**; `quantity = members.length`. (If your Stripe prices are flat, set them to per-seat to use this; or set `PLANS[x].perSeat=false` to bill flat — see Step on plans.js.)
- **Free org cap:** `PLANS.free.maxSeats = 1`. Pro/studio = unlimited (`null`). Inviting a 2nd member on a free org → **402** "Upgrade to a paid plan to add team members."
- **Sync is best-effort:** membership changes don't block on Stripe; if the quantity update fails it's logged (seat drift reconciles on the next change / via the webhook). Rationale: never break team management on a billing-API hiccup.

**Tech stack:** Express + Mongoose, node:test + in-memory mongo + supertest (stripe injected via `app.locals.stripe`, null in normal tests → no-op). React frontend (build-gated). Builds on #4 billing.

**Scope:** per-seat quantity sync + free-org seat cap + seat display UI. NOT: usage-based metered billing, seat-level credit sub-allocation, ownership transfer.

---

## Task 1: backend — seat sync, per-seat checkout quantity, free-org cap

**Files:** Modify `server/plans.js`, `server/routes/billing.js`, `server/routes/workspaces.js`; Create `server/utils/seats.js`; Test `server/test/seat-billing.test.js`

- [ ] **Step 1 — `server/plans.js`:** add `maxSeats` to each plan: `free: { ...maxSeats: 1 }`, `pro: { ...maxSeats: null }`, `studio: { ...maxSeats: null }` (null = unlimited). Export a helper `planMaxSeats(plan)` returning the value (default free's). Keep existing planFeatures/planCredits intact.

- [ ] **Step 2 — `server/utils/seats.js`:** seat-count + Stripe-quantity sync.
```js
import Workspace from '../models/Workspace.js'
import { getStripe } from './stripe.js'

// Seat count = members of an organization workspace (personal = always 1).
export function seatCount(workspace) {
  if (!workspace) return 1
  if (workspace.type !== 'organization') return 1
  return (workspace.members || []).length || 1
}

// Best-effort: set the workspace's Stripe subscription quantity to its seat count.
// No-op if no subscription, not an org, or Stripe unavailable. Never throws.
export async function syncSeats(workspace, { stripe } = {}) {
  try {
    const s = stripe || getStripe()
    if (!s) return { synced: false, reason: 'no-stripe' }
    if (!workspace || workspace.type !== 'organization' || !workspace.stripeSubscriptionId) {
      return { synced: false, reason: 'no-subscription' }
    }
    const sub = await s.subscriptions.retrieve(workspace.stripeSubscriptionId)
    const item = sub.items?.data?.[0]
    if (!item) return { synced: false, reason: 'no-item' }
    const quantity = seatCount(workspace)
    if (item.quantity === quantity) return { synced: true, quantity, unchanged: true }
    await s.subscriptions.update(workspace.stripeSubscriptionId, {
      items: [{ id: item.id, quantity }],
      proration_behavior: 'create_prorations',
    })
    return { synced: true, quantity }
  } catch (err) {
    console.error('syncSeats error:', err.message)
    return { synced: false, reason: 'error', error: err.message }
  }
}
```

- [ ] **Step 3 — `server/routes/billing.js` checkout:** for an org **subscription**, set the seat quantity. Import `seatCount` from `../utils/seats.js`. Change the line_items quantity:
```js
const qty = kind === 'subscription' ? seatCount(req.workspace) : 1
// ...
line_items: [{ price: priceId, quantity: qty }],
```
(Pack purchases stay quantity 1.)

- [ ] **Step 4 — `server/routes/workspaces.js` free-org seat cap + sync:** import `planMaxSeats` from `../plans.js` and `syncSeats` from `../utils/seats.js`.
  - In **POST `/:id/invite`**: after the role/auth check, enforce the cap — if `ws.type === 'organization'`, compute the would-be seat count (current members + pending unique invites + 1) and if `planMaxSeats(ws.plan)` is a number and the count would exceed it, return **402** `{ error: 'Upgrade to a paid plan to add team members', code: 'seat_limit' }`. Simplest correct check: if `planMaxSeats(ws.plan) != null && ws.members.length >= planMaxSeats(ws.plan)` → 402 (a free org already has its 1 owner-seat, so any invite is blocked).
  - In **POST `/accept-invite`**: after pushing the new member and `ws.save()`, call `await syncSeats(ws, { stripe: req.app.locals.stripe })` (best-effort; the member is added regardless). Also re-check the cap defensively before pushing: if `planMaxSeats(ws.plan) != null && ws.members.length >= planMaxSeats(ws.plan)` and not already a member → 402.
  - In **DELETE `/:id/members/:userId`**: after `ws.save()`, call `await syncSeats(ws, { stripe: req.app.locals.stripe })` (best-effort).

- [ ] **Step 5 — failing test** `server/test/seat-billing.test.js`. Use the project's real test helpers (READ an existing workspaces test first for exact helper names — `makeAuthedUser`, db helpers, auth header). Cover:
  1. `seatCount` returns 1 for personal, members.length for org (unit test — import the fn, build plain objects).
  2. Inviting on a **free** org returns 402 (seat_limit).
  3. After upgrading the org to `pro` (set ws.plan='pro' directly), inviting succeeds (200).
  4. `syncSeats` is a no-op (`synced:false`, no throw) when stripe is null / no subscription.
  5. `syncSeats` calls `subscriptions.update` with the right quantity when given a fake injected stripe + an org with stripeSubscriptionId and N members (assert the update was called with quantity===N). Build the fake stripe as `{ subscriptions: { retrieve: async () => ({ items: { data: [{ id: 'si_1', quantity: 1 }] } }), update: async (id, params) => { captured = params; return {} } } }`.

- [ ] **Step 6 — run the seat test → PASS. Then full suite (`cd server && npm test`) → no regressions (was 140). Commit** `feat: per-seat team billing — seat-synced subscription quantity + free-org seat cap [#5 T1]`

---

## Task 2: client — seat count + per-seat billing display, invite upgrade prompt

**Files:** Modify `src/components/dashboard/ProfilePage.jsx`, `src/lib/api.js` (only if a helper is missing)

- [ ] **Step 1 — READ** ProfilePage's Workspace tab (members list + invite form) and Billing section (from #4). Note how invite errors surface (`setMsg`).
- [ ] **Step 2 — Seat display:** in the Workspace tab for an organization workspace, show "Seats: {memberCount}" near the members list, and in the billing area a line "Billed per seat — {memberCount} × {plan}" when the org is on a paid plan.
- [ ] **Step 3 — Invite gate UX:** the invite form's submit handler already calls the invite API; when it returns 402 with `code: 'seat_limit'`, show a clear message via setMsg ("Upgrade to a paid plan to add team members") and (if easy) scroll/point to the Upgrade buttons. Don't hard-disable invite for free orgs unless trivial — the 402 message is sufficient.
- [ ] **Step 4 — `npm run build` (repo root) → success. Commit** `feat(ui): show team seats + per-seat billing; surface seat-limit upgrade prompt [#5 T2]`

---

## Task 3: verification
- [ ] `cd server && npm test` → all pass.
- [ ] `npm run build` → success.
- [ ] Push.

---

## Self-Review (planning)
**Coverage:** per-seat quantity at checkout (T1 S3), quantity sync on add/remove (T1 S2/S4), free-org cap (T1 S4), seat UI (T2). 
**Deferred:** ownership transfer, metered/usage billing, seat-level credit allocation, hard per-plan seat ceilings beyond free (pro/studio unlimited). 
**Risk:** seat sync is best-effort (Stripe failure → drift); acceptable because membership must not block on billing, and the next membership change re-syncs. The free-org cap uses `members.length >= maxSeats` — correct since a free org always has exactly its 1 owner seat. Personal workspaces are never gated (always 1 seat).
**Decision flagged for user:** per-seat assumes the pro/studio Stripe prices are per-unit recurring prices. If they're configured flat-rate, either reconfigure in Stripe or treat quantity as informational.
