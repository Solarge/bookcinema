# Sub-project #4 — Billing (Stripe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Let workspaces pay: **plan subscriptions** (Pro/Studio → set `workspace.plan`, which drives the #3 monthly allowance) and one-time **credit packs** (→ add persistent purchased credits), via Stripe Checkout + a signature-verified, idempotent webhook. Adopt a **two-bucket** credit model so purchased credits survive the monthly reset.

**Architecture:**
- **Two-bucket credits:** `Workspace.monthlyCredits` (reset to the plan allowance on the #3 monthly refill) + `Workspace.purchasedCredits` (persist until used). A schema **virtual `creditBalance` = monthly + purchased** keeps existing reads working. Debits draw monthly-first via an **atomic aggregation-pipeline update** guarded on the sum. Refunds go to the monthly bucket. Packs add to purchased.
- **Stripe:** `stripe` SDK; `config.stripe` (secret/webhook/publishable + price→product mapping from env). `POST /api/billing/checkout` creates a Checkout Session (mode `subscription` for a plan, `payment` for a pack) scoped to the active workspace (workspaceId in metadata + a stable Stripe customer per workspace). `POST /api/billing/webhook` (raw body, `stripe.webhooks.constructEvent` signature verify) handles `checkout.session.completed` (pack → grant purchased credits; subscription → record customer), `customer.subscription.created|updated|deleted` (→ set `workspace.plan`), **idempotently** via a `ProcessedWebhookEvent` collection. `GET /api/billing/portal` → Stripe Billing Portal session.
- **UI:** account modal "Billing" — show two-bucket balance + current plan, "Upgrade" (subscription) + "Buy credits" (pack) buttons → redirect to Checkout; "Manage billing" → portal.

**Tech stack:** builds on #2 (credits service), #3 (plans/refill). `stripe` npm dep. node:test + in-memory mongo + supertest; Stripe calls **mocked** in tests (live test-mode keys present for manual/CLI verification). Webhook live-verify needs `stripe listen` + the resulting `whsec_...` in `STRIPE_WEBHOOK_SECRET`.

**Scope:** subscriptions + packs + webhook + portal + two-bucket. NOT tax/invoicing UI, proration edge cases, dunning emails (Stripe handles retries), or seat billing (#5).

---

## Task 1: two-bucket credit model (refactor #2/#3 to monthly + purchased)

**Files:** Modify `server/models/Workspace.js`, `server/utils/credits.js`, `server/utils/refill.js`; update affected tests (`credit-models`, `credits-service`, `refill`, and any `creditBalance` references in route tests).

- [ ] **Step 1 — Workspace model.** Replace `creditBalance: { type: Number, default: 25, min: 0 }` with:
```js
  monthlyCredits:   { type: Number, default: 25, min: 0 },
  purchasedCredits: { type: Number, default: 0,  min: 0 },
```
Add a virtual + enable virtuals in JSON so `creditBalance` still reads as the sum:
```js
workspaceSchema.virtual('creditBalance').get(function () { return (this.monthlyCredits || 0) + (this.purchasedCredits || 0) })
workspaceSchema.set('toJSON', { virtuals: true })
workspaceSchema.set('toObject', { virtuals: true })
```
(Place the virtual + set() calls after the schema definition, before the model compile. Keep existing methods/indexes.)

- [ ] **Step 2 — credits service (`server/utils/credits.js`).** Rewrite the three functions for two buckets:
```js
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'

// Atomic debit: requires monthly+purchased >= amount; draws monthly-first, then purchased.
export async function debitCredits(workspaceId, amount, { type = null, tier = null, jobId = null } = {}) {
  const ws = await Workspace.findOneAndUpdate(
    { _id: workspaceId, $expr: { $gte: [{ $add: ['$monthlyCredits', '$purchasedCredits'] }, amount] } },
    [{ $set: {
      purchasedCredits: { $cond: [ { $gte: ['$monthlyCredits', amount] }, '$purchasedCredits',
        { $subtract: ['$purchasedCredits', { $subtract: [amount, '$monthlyCredits'] }] } ] },
      monthlyCredits: { $max: [0, { $subtract: ['$monthlyCredits', amount] }] },
    } }],
    { new: true },
  )
  if (!ws) return { ok: false }
  const balanceAfter = ws.monthlyCredits + ws.purchasedCredits
  await CreditTransaction.create({ workspaceId, amount: -amount, reason: 'debit', type, tier, jobId, balanceAfter })
  return { ok: true, balance: balanceAfter }
}

// Refund returns credits to the monthly bucket.
export async function refundCredits(workspaceId, amount, { jobId = null, type = null, tier = null } = {}) {
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { monthlyCredits: amount } }, { new: true })
  if (!ws) return { ok: false }
  const balanceAfter = ws.monthlyCredits + ws.purchasedCredits
  await CreditTransaction.create({ workspaceId, amount, reason: 'refund', type, tier, jobId, balanceAfter })
  return { ok: true, balance: balanceAfter }
}

// Grant to a bucket: 'purchased' (packs) or 'monthly' (admin/allowance). Default purchased.
export async function grantCredits(workspaceId, amount, { note = '', bucket = 'purchased' } = {}) {
  const field = bucket === 'monthly' ? 'monthlyCredits' : 'purchasedCredits'
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { [field]: amount } }, { new: true })
  if (!ws) return { ok: false }
  const balanceAfter = ws.monthlyCredits + ws.purchasedCredits
  await CreditTransaction.create({ workspaceId, amount, reason: 'grant', balanceAfter, note })
  return { ok: true, balance: balanceAfter }
}
```

- [ ] **Step 3 — refill (`server/utils/refill.js`).** Reset ONLY the monthly bucket (purchased persists). Change the `$set` to `{ monthlyCredits: allowance, creditPeriod: period }` and compute `balanceAfter`/return from the updated doc's `monthlyCredits + purchasedCredits`. The ledger row stays `reason: 'grant'`, `amount: allowance`. Keep the not-found + same-period guards.

- [ ] **Step 4 — fix existing tests** that set/asserted `creditBalance` directly:
  - `credit-models.test.js`, `credits-service.test.js`, `refill.test.js`, `generate-routes.test.js`, `plan-enforcement.test.js`, `process-generation.test.js`, `admin-credits.test.js`: anywhere a workspace is created with `creditBalance: N`, change to `monthlyCredits: N` (the monthly bucket) — the virtual `creditBalance` still reads the sum. Anywhere a test asserts `ws.creditBalance === N`, it still works via the virtual (sum). For debit/refund assertions, the totals are unchanged (debit from monthly first). Add at least one NEW test in `credits-service.test.js` proving monthly-first draw: monthly=2, purchased=5, debit 4 → monthly=0, purchased=3 (balance 3).
  - Run each touched test file; then the full suite.

- [ ] **Step 5 — commit** `feat: two-bucket credits (monthly allowance + persistent purchased) [#4 T1]`

> This is the riskiest task (touches the credit core). Verify the FULL suite is green before proceeding.

---

## Task 2: Stripe config + SDK + ProcessedWebhookEvent

**Files:** Modify `server/package.json` (add `stripe`), `server/config.js`; Create `server/models/ProcessedWebhookEvent.js`, `server/utils/stripe.js`; Test `server/test/stripe-config.test.js`

- [ ] **Step 1 — add dep:** `cd server && npm install stripe@^17`.
- [ ] **Step 2 — config.** In `config.js` add:
```js
  stripe: {
    secretKey:       process.env.STRIPE_SECRET_KEY      || '',
    webhookSecret:   process.env.STRIPE_WEBHOOK_SECRET  || '',
    publishableKey:  process.env.STRIPE_PUBLISHABLE_KEY || '',
    prices: {
      pro:    process.env.STRIPE_PRICE_PRO    || '',   // recurring price id
      studio: process.env.STRIPE_PRICE_STUDIO || '',
      pack_small:  process.env.STRIPE_PRICE_PACK_SMALL  || '',  // one-time price ids
      pack_medium: process.env.STRIPE_PRICE_PACK_MEDIUM || '',
      pack_large:  process.env.STRIPE_PRICE_PACK_LARGE  || '',
    },
    // credits granted per one-time pack price (purchased bucket)
    packCredits: { pack_small: 100, pack_medium: 500, pack_large: 2000 },
  },
```
Append these to `.env.server.example` (STRIPE_PRICE_* placeholders).
- [ ] **Step 3 — `server/utils/stripe.js`:** lazily construct the Stripe client (so the app boots without a key); export `getStripe()` returning `new Stripe(config.stripe.secretKey)` or null if no key. Export a `planForPriceId(priceId)` helper mapping a subscription price id → 'pro'/'studio' (using config.stripe.prices), and `packForPriceId(priceId)` → credits via packCredits.
- [ ] **Step 4 — `server/models/ProcessedWebhookEvent.js`:** `{ eventId: { type: String, unique: true }, type: String }`, timestamps. Used to dedupe webhook deliveries.
- [ ] **Step 5 — test `stripe-config.test.js`:** assert config.stripe shape + planForPriceId/packForPriceId mapping (set the env price ids in the test, re-import). Commit `feat: stripe config + client + webhook-dedupe model [#4 T2]`.

---

## Task 3: billing routes (checkout, webhook, portal)

**Files:** Create `server/routes/billing.js`; Modify `server/index.js` (mount, with RAW body for the webhook); Test `server/test/billing-routes.test.js`

- [ ] **Step 1 — webhook raw body.** Stripe signature verification needs the raw body. In `server/index.js`, mount the webhook route BEFORE `express.json()` with `express.raw({ type: 'application/json' })`, e.g.:
```js
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookRouter)
```
and mount the rest of billing (`checkout`, `portal`) after json with `app.use('/api/billing', billingRouter)`. (Two routers, or one router that special-cases. Simplest: a dedicated `webhookHandler` mounted raw, and a `billingRouter` for checkout/portal mounted under json.)
- [ ] **Step 2 — `server/routes/billing.js`** exports `billingRouter` (requireAuth + resolveWorkspace; POST /checkout, GET /portal) and `webhookHandler` (no auth; verifies signature). Key logic:
  - **POST /checkout** `{ kind: 'subscription'|'pack', key }` where key ∈ plan('pro'|'studio') or pack id. Resolve the Stripe price id from config; create/reuse a Stripe customer for the workspace (store `workspace.stripeCustomerId`); create a Checkout Session with `mode` = subscription/payment, `line_items: [{ price, quantity: 1 }]`, `success_url`/`cancel_url` (from config.clientUrl), and `metadata: { workspaceId }` (+ `subscription_data.metadata` for subs). Return `{ url: session.url }`. 402/400 on bad key / no Stripe configured.
  - **GET /portal** → Stripe Billing Portal session for the workspace's customer → `{ url }`.
  - **webhookHandler**: `stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret)`; on signature error → 400. Dedupe via `ProcessedWebhookEvent` (insert eventId; if duplicate key, return 200 already-processed). Handle:
    - `checkout.session.completed`: if `mode==='payment'` → look up pack credits by the line item price (or store pack key in metadata) → `grantCredits(workspaceId, credits, { bucket:'purchased', note:'pack' })`. If `mode==='subscription'` → store `workspace.stripeCustomerId`/`stripeSubscriptionId` (plan is set by the subscription.* events).
    - `customer.subscription.created|updated`: map the subscription's price → plan → `Workspace.findByIdAndUpdate(workspaceId, { plan })` (find workspace by metadata.workspaceId or stripeCustomerId). If status not active/trialing → plan 'free'.
    - `customer.subscription.deleted`: set plan 'free'.
    - Return 200.
- [ ] **Step 3 — tests `billing-routes.test.js`** (mock Stripe): 
  - Mock `getStripe()` (inject via `req.app.locals.stripe` or a deps param) so checkout returns a fake session url (assert 200 + url, customer reused). 
  - Webhook: feed a constructed event object through a test seam that bypasses real signature verification (e.g. `webhookHandler` accepts an injected `constructEvent` via app.locals for tests) — assert a `pack` checkout.session.completed grants purchased credits; a subscription.updated sets plan; duplicate eventId is ignored (idempotent).
- [ ] **Step 4 — Workspace fields:** add `stripeCustomerId` + `stripeSubscriptionId` (String, default null) to the Workspace model (in this task or T1).
- [ ] **Step 5 — commit** `feat: Stripe checkout + webhook (idempotent) + portal [#4 T3]`.

> Make Stripe + constructEvent injectable (app.locals) so tests need no real Stripe/network. Live webhook verification is done later with `stripe listen` + the real `whsec_`.

---

## Task 4: billing UI

**Files:** Modify `src/lib/api.js` (billing namespace), `src/components/dashboard/ProfilePage.jsx` (Billing tab)

- [ ] **Step 1 — api.js:** add `export const billing = { checkout: (data) => post('/api/billing/checkout', data), portal: () => get('/api/billing/portal') }`.
- [ ] **Step 2 — ProfilePage:** in the Workspace tab (or a new "Billing" tab), show monthly + purchased credits separately (and total), the current plan, and buttons: "Upgrade to Pro/Studio" (→ `billing.checkout({kind:'subscription', key:'pro'})` then `window.location = url`), "Buy credits" (pack options → `billing.checkout({kind:'pack', key})`), and "Manage billing" (→ `billing.portal()`). Handle the "Stripe not configured" error gracefully.
- [ ] **Step 3 — build + commit** `feat(ui): billing tab (subscribe, buy credits, portal)`.

---

## Task 5: full verification
- [ ] `cd server && npm test` → all pass.
- [ ] `npm run build` → success.
- [ ] (manual, later) Live: set `STRIPE_PRICE_*` to real test price ids; run `stripe listen --forward-to localhost:3001/api/billing/webhook`, put the `whsec_` in env; do a test checkout; confirm credits/plan update via webhook.
- [ ] Push.

---

## Self-Review (planning)
**Coverage:** two-bucket model (T1) reconciles purchases with the #3 monthly reset; Stripe config/client/dedupe (T2); checkout + idempotent signature-verified webhook + portal (T3); UI (T4). Debit is atomic (aggregation pipeline guarded on the sum); webhook is idempotent (ProcessedWebhookEvent) + signature-verified; Stripe injected for hermetic tests.
**Deferred:** seat billing (#5), tax/invoice UI, proration UX, dunning (Stripe handles retries). Live webhook verification pending `stripe listen` + real price ids.
**Risk:** T1 touches the credit core — full suite must stay green. Webhook security (raw body + signature) must be correct; tests inject constructEvent but a live `stripe listen` check is the real proof.
