import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import { billingRouter, webhookHandler } from '../routes/billing.js'
import adminRoutes from '../routes/admin.js'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'
import Job from '../models/Job.js'
import { makeAuthedUser } from './helpers/auth.js'
import { refundCredits, grantCredits, debitCredits } from '../utils/credits.js'
import { maybeRefundOnFailure } from '../worker/refundOnFailure.js'
import { signAccess } from '../utils/jwt.js'
import { config } from '../config.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function webhookApp(constructEvent) {
  const a = express()
  a.locals.constructEvent = constructEvent
  a.post('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler)
  return a
}
function checkoutApp(stripe) {
  const a = express(); a.use(express.json()); a.locals.stripe = stripe
  a.use('/api/billing', billingRouter); return a
}
function adminApp() { const a = express(); a.use(express.json()); a.use('/api/admin', adminRoutes); return a }
async function adminToken() {
  const u = await User.create({ name: 'Admin', email: `a${Math.random()}@x.com`, password: 'password1234', role: 'admin' })
  return signAccess({ userId: u._id, email: u.email, role: u.role })
}
function postWebhook(app, evt) {
  return request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(evt))
}
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())

// ─── 1. Dunning: invoice.payment_failed ────────────────────────────────────

test('webhook: invoice.payment_failed downgrades workspace plan to free', async () => {
  const { workspace } = await makeAuthedUser()
  // Put the workspace on a paid plan first
  await Workspace.findByIdAndUpdate(workspace._id, { plan: 'pro', stripeCustomerId: 'cus_dunning' })
  const evt = {
    id: 'evt_inv_fail',
    type: 'invoice.payment_failed',
    data: { object: { customer: 'cus_dunning' } },
  }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await postWebhook(app, evt)
  assert.equal(r.status, 200)
  assert.equal((await Workspace.findById(workspace._id)).plan, 'free')
})

test('webhook: invoice.payment_failed is idempotent (duplicate event acked)', async () => {
  const { workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { plan: 'pro', stripeCustomerId: 'cus_dun2' })
  const evt = { id: 'evt_inv_fail2', type: 'invoice.payment_failed', data: { object: { customer: 'cus_dun2' } } }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  await postWebhook(app, evt)
  const r2 = await postWebhook(app, evt)
  assert.equal(r2.body.duplicate, true)
  assert.equal((await Workspace.findById(workspace._id)).plan, 'free')
})

// ─── 2. Dunning: subscription.updated with various statuses ─────────────────

test('webhook: subscription.updated with status past_due downgrades to free', async () => {
  config.stripe.prices.studio = 'price_studio_d'
  const { workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { plan: 'studio' })
  const evt = {
    id: 'evt_sub_pastdue',
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_pd', status: 'past_due', customer: 'cus_pd', metadata: { workspaceId: String(workspace._id) }, items: { data: [{ price: { id: 'price_studio_d' } }] } } },
  }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await postWebhook(app, evt)
  assert.equal(r.status, 200)
  assert.equal((await Workspace.findById(workspace._id)).plan, 'free')
})

test('webhook: subscription.updated with status unpaid downgrades to free', async () => {
  config.stripe.prices.pro = 'price_pro_d'
  const { workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { plan: 'pro' })
  const evt = {
    id: 'evt_sub_unpaid',
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_u', status: 'unpaid', customer: 'cus_u', metadata: { workspaceId: String(workspace._id) }, items: { data: [{ price: { id: 'price_pro_d' } }] } } },
  }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await postWebhook(app, evt)
  assert.equal(r.status, 200)
  assert.equal((await Workspace.findById(workspace._id)).plan, 'free')
})

test('webhook: subscription.updated with status canceled downgrades to free', async () => {
  config.stripe.prices.pro = 'price_pro_d2'
  const { workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { plan: 'pro' })
  const evt = {
    id: 'evt_sub_canceled',
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_c', status: 'canceled', customer: 'cus_c', metadata: { workspaceId: String(workspace._id) }, items: { data: [{ price: { id: 'price_pro_d2' } }] } } },
  }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await postWebhook(app, evt)
  assert.equal(r.status, 200)
  assert.equal((await Workspace.findById(workspace._id)).plan, 'free')
})

test('webhook: subscription.updated with status active keeps the mapped plan', async () => {
  config.stripe.prices.studio = 'price_studio_a'
  const { workspace } = await makeAuthedUser()
  const evt = {
    id: 'evt_sub_active',
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_a', status: 'active', customer: 'cus_a', metadata: { workspaceId: String(workspace._id) }, items: { data: [{ price: { id: 'price_studio_a' } }] } } },
  }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await postWebhook(app, evt)
  assert.equal(r.status, 200)
  assert.equal((await Workspace.findById(workspace._id)).plan, 'studio')
})

// ─── 3. refundCredits bucket option ─────────────────────────────────────────

test('refundCredits with bucket=purchased restores purchasedCredits', async () => {
  const uid = new mongoose.Types.ObjectId()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: uid, monthlyCredits: 0, purchasedCredits: 0 })
  const r = await refundCredits(w._id, 10, { bucket: 'purchased' })
  assert.equal(r.ok, true)
  const reloaded = await Workspace.findById(w._id)
  assert.equal(reloaded.purchasedCredits, 10)
  assert.equal(reloaded.monthlyCredits, 0)
})

test('refundCredits with bucket=monthly restores monthlyCredits (default)', async () => {
  const uid = new mongoose.Types.ObjectId()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: uid, monthlyCredits: 5, purchasedCredits: 0 })
  const r = await refundCredits(w._id, 3, { bucket: 'monthly' })
  assert.equal(r.ok, true)
  const reloaded = await Workspace.findById(w._id)
  assert.equal(reloaded.monthlyCredits, 8)
  assert.equal(reloaded.purchasedCredits, 0)
})

test('debitCredits returns fromMonthly and fromPurchased breakdown', async () => {
  const uid = new mongoose.Types.ObjectId()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: uid, monthlyCredits: 2, purchasedCredits: 5 })
  const r = await debitCredits(w._id, 4)
  assert.equal(r.ok, true)
  assert.equal(r.fromMonthly, 2)
  assert.equal(r.fromPurchased, 2)
})

// ─── 4. Worker: refundOnFailure uses precise bucket refund ──────────────────

test('maybeRefundOnFailure uses precise bucket refund when Job has debit breakdown', async () => {
  const uid = new mongoose.Types.ObjectId()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: uid, members: [{ userId: uid, role: 'owner' }], monthlyCredits: 0, purchasedCredits: 0 })
  // Create a Job with known bucket breakdown (text/premium = 3 credits)
  const jobDoc = await Job.create({
    workspaceId: w._id,
    createdBy: uid,
    type: 'text',
    tier: 'premium',
    debitMonthly: 1,
    debitPurchased: 2,
  })
  const bullJob = {
    data: { workspaceId: String(w._id), type: 'text', tier: 'premium', jobId: jobDoc._id },
    attemptsMade: 2,
    opts: { attempts: 2 },
  }
  const r = await maybeRefundOnFailure(bullJob)
  assert.equal(r.refunded, true)
  const reloaded = await Workspace.findById(w._id)
  assert.equal(reloaded.monthlyCredits, 1)     // debitMonthly restored
  assert.equal(reloaded.purchasedCredits, 2)   // debitPurchased restored
})

test('maybeRefundOnFailure falls back to purchased bucket when no Job breakdown', async () => {
  const uid = new mongoose.Types.ObjectId()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: uid, members: [{ userId: uid, role: 'owner' }], monthlyCredits: 0, purchasedCredits: 0 })
  const bullJob = {
    data: { workspaceId: String(w._id), type: 'text', tier: 'premium', jobId: new mongoose.Types.ObjectId() },
    attemptsMade: 2,
    opts: { attempts: 2 },
  }
  const r = await maybeRefundOnFailure(bullJob)
  assert.equal(r.refunded, true)
  const reloaded = await Workspace.findById(w._id)
  assert.equal(reloaded.monthlyCredits, 0)          // not touched
  assert.equal(reloaded.purchasedCredits, 3)         // text/premium = 3 credits, safe fallback
})

// ─── 5. Checkout session includes Stripe tax + billing address params ────────

test('checkout session create is called with automatic_tax, billing_address_collection, tax_id_collection', async () => {
  config.stripe.prices.pro = 'price_pro_tax'
  const { token, workspace } = await makeAuthedUser()
  let capturedArgs = null
  const fakeStripe = {
    customers: { create: async () => ({ id: 'cus_tax' }) },
    checkout: {
      sessions: {
        create: async (args) => {
          capturedArgs = args
          return { url: 'https://checkout.stripe.test/tax' }
        },
      },
    },
  }
  const app = checkoutApp(fakeStripe)
  const res = await authed(request(app).post('/api/billing/checkout'), token, workspace._id)
    .send({ kind: 'subscription', key: 'pro' })
  assert.equal(res.status, 200)
  assert.ok(capturedArgs, 'stripe.checkout.sessions.create should have been called')
  assert.deepEqual(capturedArgs.automatic_tax, { enabled: true })
  assert.equal(capturedArgs.billing_address_collection, 'required')
  assert.deepEqual(capturedArgs.customer_update, { address: 'auto', name: 'auto' })
  assert.deepEqual(capturedArgs.tax_id_collection, { enabled: true })
})

// ─── 6. Admin credits/plan operate on user's personal workspace ─────────────

test('admin PATCH /users/:id/credits grants credits to the personal workspace', async () => {
  const token = await adminToken()
  const { user, workspace } = await makeAuthedUser()
  const startBalance = (await Workspace.findById(workspace._id)).creditBalance
  const res = await request(adminApp())
    .patch(`/api/admin/users/${user._id}/credits`)
    .set('Authorization', `Bearer ${token}`)
    .send({ credits: 50 })
  assert.equal(res.status, 200)
  assert.equal(res.body.workspaceId.toString(), workspace._id.toString())
  assert.equal(res.body.balance, startBalance + 50)
  // Workspace was actually updated
  assert.equal((await Workspace.findById(workspace._id)).creditBalance, startBalance + 50)
})

test('admin PATCH /users/:id/credits returns 404 when user not found', async () => {
  const token = await adminToken()
  const fakeId = new mongoose.Types.ObjectId()
  const res = await request(adminApp())
    .patch(`/api/admin/users/${fakeId}/credits`)
    .set('Authorization', `Bearer ${token}`)
    .send({ credits: 10 })
  assert.equal(res.status, 404)
})

test('admin PATCH /users/:id/plan sets plan on the personal workspace', async () => {
  const token = await adminToken()
  const { user, workspace } = await makeAuthedUser()
  const res = await request(adminApp())
    .patch(`/api/admin/users/${user._id}/plan`)
    .set('Authorization', `Bearer ${token}`)
    .send({ plan: 'studio' })
  assert.equal(res.status, 200)
  assert.equal(res.body.workspacePlan, 'studio')
  assert.equal((await Workspace.findById(workspace._id)).plan, 'studio')
})

test('admin PATCH /users/:id/plan also updates role when provided', async () => {
  const token = await adminToken()
  const { user } = await makeAuthedUser()
  const res = await request(adminApp())
    .patch(`/api/admin/users/${user._id}/plan`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role: 'admin' })
  assert.equal(res.status, 200)
  const updatedUser = await User.findById(user._id)
  assert.equal(updatedUser.role, 'admin')
})

test('admin PATCH /users/:id/plan returns 404 when user not found', async () => {
  const token = await adminToken()
  const fakeId = new mongoose.Types.ObjectId()
  const res = await request(adminApp())
    .patch(`/api/admin/users/${fakeId}/plan`)
    .set('Authorization', `Bearer ${token}`)
    .send({ plan: 'pro' })
  assert.equal(res.status, 404)
})

// ─── 7. Admin search regex escaping ─────────────────────────────────────────

test('admin GET /users?search= with regex metacharacters does not crash', async () => {
  const token = await adminToken()
  // These chars would throw "Invalid regular expression" if unescaped
  const metacharStrings = ['(.*)', '[^abc]', 'a{2,5}', 'test+user', 'foo|bar']
  for (const s of metacharStrings) {
    const res = await request(adminApp())
      .get(`/api/admin/users?search=${encodeURIComponent(s)}`)
      .set('Authorization', `Bearer ${token}`)
    assert.equal(res.status, 200, `search=${s} should not crash`)
    assert.ok(Array.isArray(res.body.users), 'users should be an array')
  }
})

test('admin GET /users?search= still finds matching users after escaping', async () => {
  const token = await adminToken()
  await User.create({ name: 'Alice', email: 'alice@test.com', password: 'password1234' })
  const res = await request(adminApp())
    .get('/api/admin/users?search=alice')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.ok(res.body.users.some(u => u.email === 'alice@test.com'))
})
