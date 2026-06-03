# Sub-project #3 — Plan / Feature Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Make the free/pro/studio plan actually govern behavior: a monthly managed-credit allowance (lazy refill), premium tiers locked to paid plans, the export watermark on free, and white-label locked to studio.

**Plan matrix (locked):**
| | free | pro | studio |
|---|---|---|---|
| monthly credits | 25 | 500 | 2000 |
| premium tiers | ❌ | ✅ | ✅ |
| watermark | on | off | off |
| white-label | ❌ | ❌ | ✅ |

**Architecture:** A single `server/plans.js` defines `PLANS` + `planFeatures(plan)` + `planCredits(plan)` (used by both server and mirrored on the client). The `Workspace` gains `creditPeriod` ('YYYY-MM'); `applyMonthlyRefill(workspace)` resets the balance to the plan allowance when the calendar month rolls over (lazy, no cron), writing a `grant` ledger row. `managedAccess` triggers the refill; `enqueueGeneration` blocks premium tiers for non-premium plans (403). The workspaces settings update gates white-label on studio. The client mirrors `planFeatures` to show the plan, lock the premium tier selector, and apply the watermark on free exports.

**Tech stack:** builds on #1/#2 (managedAccess, enqueueGeneration, credits service, Workspace, CreditTransaction). node:test + in-memory mongo + supertest. Frontend gate: `npm run build`.

**Scope:** plan-driven enforcement + lazy refill + watermark + white-label gate + plan UI. NOT purchasing/upgrade flow (that's billing #4 — plan is set by admin for now). NOT rollover of unused credits (monthly reset-to-allowance).

---

## Task 1: plan definitions

**Files:** Create `server/plans.js`; Test `server/test/plans.test.js`

- [ ] **Step 1 — failing test** `server/test/plans.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFeatures, planCredits } from '../plans.js'

test('plan features per tier', () => {
  assert.equal(planFeatures('free').premium, false)
  assert.equal(planFeatures('free').watermark, true)
  assert.equal(planFeatures('pro').premium, true)
  assert.equal(planFeatures('pro').watermark, false)
  assert.equal(planFeatures('studio').whiteLabel, true)
  assert.equal(planFeatures('free').whiteLabel, false)
})
test('plan credits per tier', () => {
  assert.equal(planCredits('free'), 25)
  assert.equal(planCredits('pro'), 500)
  assert.equal(planCredits('studio'), 2000)
})
test('unknown plan falls back to free', () => {
  assert.equal(planCredits('bogus'), 25)
  assert.equal(planFeatures(undefined).premium, false)
})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — create `server/plans.js`:**
```js
export const PLANS = {
  free:   { credits: 25,   premium: false, watermark: true,  whiteLabel: false },
  pro:    { credits: 500,  premium: true,  watermark: false, whiteLabel: false },
  studio: { credits: 2000, premium: true,  watermark: false, whiteLabel: true  },
}
export function planFeatures(plan) { return PLANS[plan] || PLANS.free }
export function planCredits(plan)  { return planFeatures(plan).credits }
```
- [ ] **Step 4 — run → PASS. Commit** `feat: plan definitions (free/pro/studio features + credits)`

---

## Task 2: Workspace.creditPeriod + lazy monthly refill

**Files:** Modify `server/models/Workspace.js`; Create `server/utils/refill.js`; Test `server/test/refill.test.js`

- [ ] **Step 1 — failing test** `server/test/refill.test.js`:
```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'
import { applyMonthlyRefill, currentPeriod } from '../utils/refill.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
async function ws(plan, balance, period) {
  const u = new mongoose.Types.ObjectId()
  return Workspace.create({ name: 'W', type: 'personal', ownerId: u, members: [{ userId: u, role: 'owner' }], plan, creditBalance: balance, creditPeriod: period })
}

test('refills to the plan allowance when the period rolls over', async () => {
  const w = await ws('pro', 3, '2000-01')
  const updated = await applyMonthlyRefill(w)
  assert.equal(updated.creditBalance, 500) // pro allowance
  assert.equal(updated.creditPeriod, currentPeriod())
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'grant' }), 1)
})
test('does NOT refill within the same period', async () => {
  const w = await ws('pro', 42, currentPeriod())
  const updated = await applyMonthlyRefill(w)
  assert.equal(updated.creditBalance, 42)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id }), 0)
})
test('first-ever refill (no period) seeds the allowance', async () => {
  const w = await ws('free', 0, null)
  const updated = await applyMonthlyRefill(w)
  assert.equal(updated.creditBalance, 25)
})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — Workspace.creditPeriod.** In `server/models/Workspace.js`, add after `creditBalance`: `creditPeriod: { type: String, default: null }, // 'YYYY-MM' of the last monthly refill`.
- [ ] **Step 4 — create `server/utils/refill.js`:**
```js
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'
import { planCredits } from '../plans.js'

export function currentPeriod(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

// Lazy monthly refill: when the calendar month rolls over, reset the workspace's
// credit balance to its plan allowance. No cron — triggered on managed requests.
export async function applyMonthlyRefill(workspace, { now = new Date() } = {}) {
  const period = currentPeriod(now)
  if (workspace.creditPeriod === period) return workspace
  const allowance = planCredits(workspace.plan)
  const updated = await Workspace.findByIdAndUpdate(
    workspace._id,
    { $set: { creditBalance: allowance, creditPeriod: period } },
    { new: true },
  )
  await CreditTransaction.create({ workspaceId: workspace._id, amount: allowance, reason: 'grant', balanceAfter: allowance, note: `monthly refill ${period}` })
  return updated
}
```
- [ ] **Step 5 — run → PASS. Commit** `feat: lazy monthly credit refill to plan allowance`

> Note: refill RESETS to the allowance (no rollover). Acceptable pre-billing; revisit when purchases (#4) add top-ups.

---

## Task 3: enforce refill + premium-tier gate in the generation path

**Files:** Modify `server/middleware/managedAccess.js`, `server/routes/generate.js`; Test `server/test/plan-enforcement.test.js`

- [ ] **Step 1 — failing test** `server/test/plan-enforcement.test.js`:
```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import generateRoutes from '../routes/generate.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
function app(q) { const a = express(); a.use(express.json()); if (q) a.locals.generationQueue = q; a.use('/api/generate', generateRoutes); return a }
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())
const Q = { add: async () => ({ id: 'b' }) }

test('free plan is blocked from premium tier (403)', async () => {
  const { token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true, plan: 'free' })
  const res = await authed(request(app(Q)).post('/api/generate/text'), token, workspace._id).send({ bookText: 'x', tier: 'premium' })
  assert.equal(res.status, 403)
})
test('pro plan can use premium tier', async () => {
  const { token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true, plan: 'pro', creditBalance: 100, creditPeriod: '9999-12' })
  const res = await authed(request(app(Q)).post('/api/generate/text'), token, workspace._id).send({ bookText: 'x', tier: 'premium' })
  assert.equal(res.status, 202)
})
test('managed request triggers a monthly refill (free workspace gets 25)', async () => {
  const { token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true, plan: 'free', creditBalance: 0, creditPeriod: '2000-01' })
  const res = await authed(request(app(Q)).post('/api/generate/text'), token, workspace._id).send({ bookText: 'x', tier: 'standard' })
  assert.equal(res.status, 202)
  const ws = await Workspace.findById(workspace._id)
  assert.equal(ws.creditBalance, 24) // refilled to 25 then debited 1
})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — managedAccess refill.** In `server/middleware/managedAccess.js`, add `import { applyMonthlyRefill } from '../utils/refill.js'`. After the allowlist check passes (and before concurrency/cap counts), refresh the workspace via refill:
```js
      req.workspace = await applyMonthlyRefill(req.workspace)
```
(Place it right after the `if (!req.workspace?.managedBeta) ...` line. The subsequent cap/concurrency logic and the route's debit then see the refilled balance.)
- [ ] **Step 4 — premium gate in enqueueGeneration.** In `server/routes/generate.js`, add `import { planFeatures } from '../plans.js'`. At the START of `enqueueGeneration`, before computing cost:
```js
  if (tier === 'premium' && !planFeatures(req.workspace.plan).premium) {
    return res.status(403).json({ error: 'Premium tier requires the Pro or Studio plan' })
  }
```
- [ ] **Step 5 — run → PASS (+ existing generate tests). Commit** `feat: monthly refill on managed requests + premium tier gated to paid plans`

---

## Task 4: white-label gated to studio

**Files:** Modify `server/routes/workspaces.js`; Test `server/test/workspaces-routes.test.js` (add a case)

- [ ] **Step 1 — failing test** appended to `server/test/workspaces-routes.test.js` (uses existing app/bearer/makeAuthedUser/Workspace):
```js
test('PUT workspace settings ignores whiteLabel unless plan is studio', async () => {
  const { user, token } = await makeAuthedUser()
  const org = await Workspace.create({ name: 'Org', type: 'organization', ownerId: user._id, plan: 'pro', members: [{ userId: user._id, role: 'owner' }] })
  const res = await bearer(request(app()).put(`/api/workspaces/${org._id}`), token).send({ settings: { whiteLabel: { appName: 'Mine' } } })
  assert.equal(res.status, 200)
  const ws = await Workspace.findById(org._id)
  assert.deepEqual(ws.settings.whiteLabel, {}) // pro can't set white-label
})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — gate in `server/routes/workspaces.js` PUT /:id.** Add `import { planFeatures } from '../plans.js'`. In the PUT handler, when applying `settings`, strip `whiteLabel` unless the plan allows it:
```js
    if (settings) {
      const next = { ...settings }
      if (next.whiteLabel && !planFeatures(ws.plan).whiteLabel) delete next.whiteLabel
      Object.assign(ws.settings, next)
    }
```
(Replace the existing `if (settings) Object.assign(ws.settings, settings)`.)
- [ ] **Step 4 — run → PASS. Commit** `feat: gate white-label settings to the Studio plan`

---

## Task 5: client — plan features, watermark, plan UI

**Files:** Create `src/utils/planFeatures.js`; Modify `src/contexts/AuthContext.jsx`, `src/utils/watermark.js`, `src/components/SettingsPanel.jsx`, `src/components/dashboard/ProfilePage.jsx`

- [ ] **Step 1 — mirror plan features client-side.** Create `src/utils/planFeatures.js`:
```js
export const PLANS = {
  free:   { credits: 25,   premium: false, watermark: true,  whiteLabel: false },
  pro:    { credits: 500,  premium: true,  watermark: false, whiteLabel: false },
  studio: { credits: 2000, premium: true,  watermark: false, whiteLabel: true  },
}
export function planFeatures(plan) { return PLANS[plan] || PLANS.free }
```
- [ ] **Step 2 — expose active workspace plan in AuthContext.** In `src/contexts/AuthContext.jsx`, add state `activeWorkspacePlan` (string, default 'free'). When the active workspace is set/switched (mount, login, register, switchWorkspace), fetch `workspacesApi.list()`, find the one whose `_id === activeWorkspaceId`, and set `activeWorkspacePlan = found?.plan || 'free'`. Expose `activeWorkspacePlan` in the context value (+ deps). (Wrap the list call in try/catch; default 'free' on failure.)
- [ ] **Step 3 — watermark wired to plan.** In `src/utils/watermark.js`, replace the stub comment/logic so the watermark is applied when the plan's `watermark` feature is true. The exported function should accept the plan (or a boolean). Minimal: export `shouldWatermark(plan)` returning `planFeatures(plan).watermark`, and have the existing watermark application read it. Wire the export/results flow that calls watermark to pass `useAuth().activeWorkspacePlan`. (Find current callers of the watermark util and pass the plan; if the util currently always/never watermarks, switch it to plan-driven.)
- [ ] **Step 4 — lock premium tier in Settings.** In `src/components/SettingsPanel.jsx` Generation Mode section (managed tier selector), if `planFeatures(activeWorkspacePlan).premium === false`, disable/lock the "Premium" option and show a small "Pro" lock hint. Read `activeWorkspacePlan` from `useAuth()`.
- [ ] **Step 5 — plan display.** In `src/components/dashboard/ProfilePage.jsx` workspace tab, show the active workspace `plan` (capitalized) near the credit balance, with a one-line summary of what it unlocks.
- [ ] **Step 6 — `npm run build` → success. Commit** `feat(ui): plan-aware watermark, premium lock, and plan display`

---

## Task 6: Full verification
- [ ] `cd server && npm test` → all pass.
- [ ] `npm run build` → success.
- [ ] Push.

---

## Self-Review (planning)
**Coverage:** plan defs (T1), monthly refill (T2), refill-trigger + premium gate (T3), white-label gate (T4), client watermark/lock/plan-UI (T5). Refill is lazy (no cron), idempotent within a period, writes a ledger row. Premium gate is server-enforced (UI lock is convenience). 
**Deferred:** purchasing/upgrade (#4 Stripe), credit rollover, per-plan daily-cap scaling (caps remain global env for now), seat limits (#5).
**Interaction note:** refill resets balance to allowance on month rollover — admin grants made mid-month are wiped at the next period boundary. Acceptable pre-billing; revisit with #4 (top-ups should be additive + survive refill).
