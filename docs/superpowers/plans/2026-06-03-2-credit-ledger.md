# Sub-project #2 — Credit Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Meter managed generation against a per-workspace **credit balance**. Each managed generation has a cost-weighted credit price; credits are atomically debited on enqueue, refunded if the job fails, and recorded in a `CreditTransaction` ledger. Admins can grant credits; the UI shows the balance.

**Architecture:** Credit prices live in the generation registry (`credits` per tier). The `Workspace` gains `creditBalance` + a `CreditTransaction` collection. A `credits` service does atomic conditional debits (`findOneAndUpdate` with a `$gte` guard → no race), refunds, and grants, each writing a ledger row. The three `/api/generate/*` routes are refactored through one shared helper that debits → creates the Job → enqueues → (refunds + 503 on enqueue failure) → 202; insufficient balance → **402**. The worker refunds on terminal failure. An admin endpoint grants credits; the account UI shows the balance.

**Tech stack:** Express, Mongoose, node:test + in-memory mongo + supertest. Builds on managed generation (#1, registry/resolve, Job, managedAccess, generate routes, worker).

**Scope:** Credit metering + ledger + admin grant + balance UI. NOT real purchasing (that's billing #4 / Stripe). NOT plan-based pricing (#3).

---

## File Structure
**Create:** `server/models/CreditTransaction.js`, `server/utils/credits.js`, tests.
**Modify:** `server/generation/registry.js` (+credits per tier), `server/generation/resolve.js` (unchanged — entries carry credits), `server/models/Workspace.js` (+creditBalance), `server/routes/generate.js` (debit + shared helper), `server/worker/processGeneration.js` (refund on failure), `server/routes/admin.js` (grant endpoint), `server/config.js` (starter credits), `src/lib/api.js` (admin.grantWorkspaceCredits) + `src/components/dashboard/ProfilePage.jsx` (balance display).

---

## Task 1: credit prices in registry + creditCost helper

**Files:** Modify `server/generation/registry.js`; Create `server/generation/creditCost.js`; Test `server/test/credit-cost.test.js`

- [ ] **Step 1 — failing test** `server/test/credit-cost.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creditCost } from '../generation/creditCost.js'

test('creditCost returns cost-weighted credits per type/tier', () => {
  assert.equal(creditCost('text', 'standard'), 1)
  assert.equal(creditCost('text', 'premium'), 3)
  assert.equal(creditCost('voice', 'standard'), 1)
  assert.equal(creditCost('voice', 'premium'), 5)
  assert.equal(creditCost('image', 'standard'), 4)
  assert.equal(creditCost('image', 'premium'), 10)
})
test('creditCost throws on unknown type/tier', () => {
  assert.throws(() => creditCost('text', 'ultra'))
})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — add `credits` to each tier in `server/generation/registry.js`.** For each entry add a `credits:` field: text.standard `credits: 1`, text.premium `credits: 3`, voice.standard `credits: 1`, voice.premium `credits: 5`, image.standard `credits: 4`, image.premium `credits: 10`. (Add to the existing objects; keep provider/adapter/model/estCostUsd.)
- [ ] **Step 4 — create `server/generation/creditCost.js`:**
```js
import { resolve } from './resolve.js'
export function creditCost(type, tier) {
  const entry = resolve(type, tier) // throws on unknown type/tier
  return entry.credits ?? 1
}
```
- [ ] **Step 5 — run → PASS. Commit** `feat: cost-weighted credit prices per generation tier`

---

## Task 2: Workspace.creditBalance + CreditTransaction model

**Files:** Modify `server/models/Workspace.js`; Create `server/models/CreditTransaction.js`; Modify `server/config.js`; Test `server/test/credit-models.test.js`

- [ ] **Step 1 — failing test** `server/test/credit-models.test.js`:
```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

test('Workspace has a numeric creditBalance defaulting to the starter amount', async () => {
  const uid = new mongoose.Types.ObjectId()
  const ws = await Workspace.create({ name: 'W', type: 'personal', ownerId: uid, members: [{ userId: uid, role: 'owner' }] })
  assert.equal(typeof ws.creditBalance, 'number')
})
test('CreditTransaction records a signed amount + reason + balanceAfter', async () => {
  const tx = await CreditTransaction.create({ workspaceId: new mongoose.Types.ObjectId(), amount: -3, reason: 'debit', balanceAfter: 7 })
  assert.equal(tx.amount, -3); assert.equal(tx.reason, 'debit')
})
test('CreditTransaction rejects an invalid reason', async () => {
  await assert.rejects(() => CreditTransaction.create({ workspaceId: new mongoose.Types.ObjectId(), amount: 1, reason: 'bogus', balanceAfter: 1 }))
})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — config starter credits.** In `server/config.js` `managed` block, add `starterCredits: Number(process.env.MANAGED_STARTER_CREDITS) || 25,`.
- [ ] **Step 4 — Workspace.creditBalance.** In `server/models/Workspace.js`, add after `managedBeta`: `creditBalance: { type: Number, default: 25, min: 0 },` (a literal default; the service uses config.managed.starterCredits when explicitly creating). Keep it simple: literal `default: 25`.
- [ ] **Step 5 — create `server/models/CreditTransaction.js`:**
```js
import mongoose from 'mongoose'

const creditTxSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  amount:      { type: Number, required: true }, // signed: negative = debit, positive = grant/refund
  reason:      { type: String, enum: ['grant', 'debit', 'refund'], required: true },
  type:        { type: String, default: null },  // generation type for debits/refunds
  tier:        { type: String, default: null },
  jobId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
  balanceAfter:{ type: Number, required: true },
  note:        { type: String, default: '' },
}, { timestamps: true })

creditTxSchema.index({ workspaceId: 1, createdAt: -1 })

export default mongoose.model('CreditTransaction', creditTxSchema)
```
- [ ] **Step 6 — run → PASS. Commit** `feat: Workspace.creditBalance + CreditTransaction ledger`

---

## Task 3: credits service (debit / refund / grant)

**Files:** Create `server/utils/credits.js`; Test `server/test/credits-service.test.js`

- [ ] **Step 1 — failing test** `server/test/credits-service.test.js`:
```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'
import { debitCredits, refundCredits, grantCredits } from '../utils/credits.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
async function ws(balance) {
  const uid = new mongoose.Types.ObjectId()
  return Workspace.create({ name: 'W', type: 'personal', ownerId: uid, members: [{ userId: uid, role: 'owner' }], creditBalance: balance })
}

test('debitCredits succeeds when balance is sufficient and writes a ledger row', async () => {
  const w = await ws(10)
  const r = await debitCredits(w._id, 3, { type: 'text', tier: 'premium' })
  assert.equal(r.ok, true); assert.equal(r.balance, 7)
  const reloaded = await Workspace.findById(w._id)
  assert.equal(reloaded.creditBalance, 7)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'debit' }), 1)
})
test('debitCredits fails (no mutation) when balance is insufficient', async () => {
  const w = await ws(2)
  const r = await debitCredits(w._id, 5, { type: 'image', tier: 'premium' })
  assert.equal(r.ok, false)
  assert.equal((await Workspace.findById(w._id)).creditBalance, 2)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id }), 0)
})
test('refundCredits adds credits back + ledger row', async () => {
  const w = await ws(5)
  const r = await refundCredits(w._id, 4, { jobId: new mongoose.Types.ObjectId() })
  assert.equal(r.balance, 9)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'refund' }), 1)
})
test('grantCredits adds credits + ledger row', async () => {
  const w = await ws(0)
  const r = await grantCredits(w._id, 50, { note: 'beta grant' })
  assert.equal(r.balance, 50)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'grant' }), 1)
})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — create `server/utils/credits.js`:**
```js
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'

// Atomic conditional debit: only succeeds if balance >= amount (no race).
export async function debitCredits(workspaceId, amount, { type = null, tier = null, jobId = null } = {}) {
  const ws = await Workspace.findOneAndUpdate(
    { _id: workspaceId, creditBalance: { $gte: amount } },
    { $inc: { creditBalance: -amount } },
    { new: true },
  )
  if (!ws) return { ok: false }
  await CreditTransaction.create({ workspaceId, amount: -amount, reason: 'debit', type, tier, jobId, balanceAfter: ws.creditBalance })
  return { ok: true, balance: ws.creditBalance }
}

export async function refundCredits(workspaceId, amount, { jobId = null, type = null, tier = null } = {}) {
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { creditBalance: amount } }, { new: true })
  if (!ws) return { ok: false }
  await CreditTransaction.create({ workspaceId, amount, reason: 'refund', type, tier, jobId, balanceAfter: ws.creditBalance })
  return { ok: true, balance: ws.creditBalance }
}

export async function grantCredits(workspaceId, amount, { note = '' } = {}) {
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { creditBalance: amount } }, { new: true })
  if (!ws) return { ok: false }
  await CreditTransaction.create({ workspaceId, amount, reason: 'grant', balanceAfter: ws.creditBalance, note })
  return { ok: true, balance: ws.creditBalance }
}
```
- [ ] **Step 4 — run → PASS. Commit** `feat: credits service (atomic debit, refund, grant)`

---

## Task 4: charge credits in the generate routes (shared helper)

**Files:** Modify `server/routes/generate.js`; Test `server/test/generate-routes.test.js` (add credit cases)

- [ ] **Step 1 — failing test additions** to `server/test/generate-routes.test.js` (uses existing app/authed/betaUser/Workspace/Job/request/assert; add an import for Workspace if not present, and the credits/CreditTransaction as needed):
```js
test('POST /text 402 when the workspace is out of credits', async () => {
  const { token, workspace } = await betaUser()
  await Workspace.findByIdAndUpdate(workspace._id, { creditBalance: 0 })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'x', tier: 'standard' })
  assert.equal(res.status, 402)
})
test('POST /text debits credits on enqueue (text standard = 1)', async () => {
  const { token, workspace } = await betaUser()
  await Workspace.findByIdAndUpdate(workspace._id, { creditBalance: 5 })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'x', tier: 'standard' })
  assert.equal(res.status, 202)
  const ws = await Workspace.findById(workspace._id)
  assert.equal(ws.creditBalance, 4)
})
```
(Ensure `Workspace` is imported in the test file.)
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — refactor `server/routes/generate.js`.** Add imports: `import { creditCost } from '../generation/creditCost.js'` and `import { debitCredits, refundCredits } from '../utils/credits.js'`. Add a shared helper and rewrite the three handlers to use it:
```js
async function enqueueGeneration(req, res, { type, params, payload }) {
  const tier = payload.tier || req.body.tier || 'standard'
  let cost
  try { cost = creditCost(type, tier) } catch { return res.status(400).json({ error: 'Invalid tier' }) }

  // Atomic debit (reserve). 402 if insufficient.
  const debit = await debitCredits(req.workspace._id, cost, { type, tier })
  if (!debit.ok) return res.status(402).json({ error: 'Insufficient credits' })

  const job = await Job.create({ workspaceId: req.workspace._id, createdBy: req.user._id, type, tier, status: 'queued', params })
  // backfill the debit's jobId is optional; ledger already recorded the debit
  try {
    const queue = req.app.locals.generationQueue
    const bull = await addGenerationJob({ jobId: String(job._id), type, tier, payload, workspaceId: String(req.workspace._id), createdBy: String(req.user._id) }, queue)
    job.bullJobId = bull?.id ? String(bull.id) : null
    await job.save()
  } catch (qErr) {
    job.status = 'failed'; job.errorMessage = 'Could not enqueue (queue unavailable)'
    await job.save()
    await refundCredits(req.workspace._id, cost, { jobId: job._id, type, tier }) // refund the reserve
    return res.status(503).json({ error: 'Generation queue unavailable', jobId: String(job._id) })
  }
  return res.status(202).json({ jobId: String(job._id) })
}
```
Then rewrite each handler body to validate its specific input then call the helper. Example `/text`:
```js
router.post('/text', managedAccess('text'), async (req, res) => {
  try {
    const { bookText, genrePreset = 'cinematic', language = 'en', tier = 'standard' } = req.body
    if (!bookText) return res.status(400).json({ error: 'bookText is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })
    return await enqueueGeneration(req, res, { type: 'text', params: { genrePreset, language }, payload: { bookText, genrePreset, language, tier } })
  } catch (err) { console.error('generate/text error:', err); res.status(500).json({ error: 'Server error' }) }
})
```
Do the same for `/voice` (validate text; params `{ text, voiceId }`; payload `{ text, voiceId, tier }`) and `/image` (validate prompt; params `{ prompt, aspectRatio }`; payload `{ prompt, aspectRatio, tier }`). Keep `managedAccess('<type>')` on each. (The helper reads `payload.tier`.)
- [ ] **Step 4 — run → PASS (existing text/voice/image tests + new credit tests).** **Commit** `feat: debit credits on managed generation (402 when insufficient; refund on enqueue failure)`

---

## Task 5: refund credits on worker failure

**Files:** Modify `server/worker/processGeneration.js`; Test `server/test/process-generation.test.js` (add a refund assertion)

- [ ] **Step 1 — failing test addition** to `server/test/process-generation.test.js`:
```js
test('processGeneration refunds credits to the workspace on failure', async () => {
  const { default: Workspace } = await import('../models/Workspace.js')
  const { default: CreditTransaction } = await import('../models/CreditTransaction.js')
  const owner = new mongoose.Types.ObjectId()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: owner, members: [{ userId: owner, role: 'owner' }], creditBalance: 0 })
  const job = await Job.create({ workspaceId: w._id, createdBy: owner, type: 'text', tier: 'premium', status: 'queued' })
  const failing = () => ({ provider: 'anthropic', adapter: { generate: async () => { throw new Error('boom') } } })
  await assert.rejects(() => processGeneration({ jobId: String(job._id), type: 'text', tier: 'premium', payload: {}, workspaceId: String(w._id), createdBy: String(owner) }, { resolveFn: failing }))
  const reloaded = await Workspace.findById(w._id)
  assert.equal(reloaded.creditBalance, 3) // text premium = 3 refunded
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'refund' }), 1)
})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — edit `server/worker/processGeneration.js`.** Add imports: `import { creditCost } from '../generation/creditCost.js'` and `import { refundCredits } from '../utils/credits.js'`. In the `catch` block, after marking the job failed + writing the failure UsageLog, refund the credits:
```js
    try { await refundCredits(workspaceId, creditCost(type, tier), { jobId, type, tier }) } catch (e) { /* refund best-effort */ }
```
(Place it inside the existing catch, before `throw err`.)
- [ ] **Step 4 — run → PASS. Commit** `feat: refund credits when a managed generation fails`

---

## Task 6: admin grant-credits endpoint

**Files:** Modify `server/routes/admin.js`; Test `server/test/admin-credits.test.js`

- [ ] **Step 1 — failing test** `server/test/admin-credits.test.js`:
```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import adminRoutes from '../routes/admin.js'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'
import { signAccess } from '../utils/jwt.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
function app() { const a = express(); a.use(express.json()); a.use('/api/admin', adminRoutes); return a }

async function adminToken() {
  const u = await User.create({ name: 'Admin', email: `a${Math.random()}@x.com`, password: 'password123', role: 'admin' })
  return signAccess({ userId: u._id, email: u.email, role: u.role })
}

test('admin can grant credits to a workspace', async () => {
  const token = await adminToken()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId(), creditBalance: 5 })
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/credits`).set('Authorization', `Bearer ${token}`).send({ amount: 50 })
  assert.equal(res.status, 200)
  assert.equal(res.body.balance, 55)
})
test('non-admin is rejected', async () => {
  const u = await User.create({ name: 'U', email: `u${Math.random()}@x.com`, password: 'password123', role: 'user' })
  const token = signAccess({ userId: u._id, email: u.email, role: u.role })
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId() })
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/credits`).set('Authorization', `Bearer ${token}`).send({ amount: 50 })
  assert.equal(res.status, 403)
})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — add to `server/routes/admin.js`** (it already uses `requireAuth, requireRole('admin')`). Add `import { grantCredits } from '../utils/credits.js'` and a route:
```js
// PATCH /api/admin/workspaces/:id/credits — grant (or deduct) workspace credits
router.patch('/workspaces/:id/credits', async (req, res) => {
  try {
    const amount = Number(req.body.amount)
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'amount must be a non-zero number' })
    const r = await grantCredits(req.params.id, amount, { note: req.body.note || 'admin grant' })
    if (!r.ok) return res.status(404).json({ error: 'Workspace not found' })
    res.json({ workspaceId: req.params.id, balance: r.balance })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
```
- [ ] **Step 4 — run → PASS. Commit** `feat: admin endpoint to grant workspace credits`

---

## Task 7: UI — show credit balance

**Files:** Modify `src/lib/api.js` (admin namespace), `src/components/dashboard/ProfilePage.jsx`

- [ ] **Step 1 — api.js**: in the `admin` namespace add `grantWorkspaceCredits: (id, amount, note) => patch(\`/api/admin/workspaces/${id}/credits\`, { amount, note })`. In `workspaces` namespace confirm `list()` returns workspaces incl. `creditBalance` (it does — full docs). No change needed there.
- [ ] **Step 2 — ProfilePage workspace tab**: in the workspace tab (added in Phase 2), display the active workspace's `creditBalance` (find it in `wsList` by `_id === activeWorkspace`) as a prominent stat, e.g. "Credits: N", with a muted hint "Used by managed generation." If balance is 0, show a low-balance note in the warning color. Match existing styles. Build-verify with `npm run build`.
- [ ] **Step 3 — Commit** `feat(ui): show workspace credit balance in account modal`

---

## Task 8: Full verification

- [ ] `cd server && npm test` → all pass.
- [ ] `npm run build` (root) → success.
- [ ] Push.

---

## Self-Review (planning)
**Coverage:** prices (T1), models (T2), atomic service (T3), debit+402+refund-on-enqueue-fail (T4), refund-on-worker-fail (T5), admin grant (T6), UI balance (T7). Atomic `$gte` debit prevents double-spend races. Only successful generations are net-charged (debit on enqueue, refund on any failure path).
**Deferred:** real purchasing (#4 Stripe), plan-based pricing/limits (#3), credit expiry, low-balance emails.
**Existing-data note:** workspaces created before this default to `creditBalance: 25` for NEW docs only; pre-existing workspaces have `undefined` → treated as 0 by the `$gte` debit (so they get 402 until granted). Admins grant via T6. Acceptable for beta.
