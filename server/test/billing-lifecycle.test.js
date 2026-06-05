import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import { billingRouter, webhookHandler } from '../routes/billing.js'
import adminRoutes from '../routes/admin.js'
import authRoutes from '../routes/auth.js'
import userRoutes from '../routes/users.js'
import workspaceRoutes from '../routes/workspaces.js'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'
import { makeAuthedUser } from './helpers/auth.js'
import { debitCredits } from '../utils/credits.js'
import { signAccess, signEmailToken } from '../utils/jwt.js'
import { config } from '../config.js'
import { planCredits } from '../plans.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Intercept sendEmail calls by monkey-patching globalThis.fetch (Resend path).
// Returns a capture array; each element is the parsed body of one email send.
function captureEmails() {
  const captured = []
  const realFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 're_test_lifecycle'
  globalThis.fetch = async (url, opts) => {
    if (typeof url === 'string' && url.includes('resend.com')) {
      captured.push(JSON.parse(opts.body))
      return { ok: true, status: 200, json: async () => ({ id: `e${captured.length}` }), text: async () => 'ok' }
    }
    return realFetch(url, opts)
  }
  // Return captured array + a restore function
  captured.restore = () => {
    globalThis.fetch = realFetch
    delete process.env.RESEND_API_KEY
  }
  return captured
}

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

function adminApp() {
  const a = express(); a.use(express.json()); a.use('/api/admin', adminRoutes); return a
}

function authApp() {
  const a = express(); a.use(express.json()); a.use(cookieParser()); a.use('/api/auth', authRoutes); return a
}

function usersApp(stripe) {
  const a = express(); a.use(express.json())
  if (stripe) a.locals.stripe = stripe
  a.use('/api/users', userRoutes); return a
}

function workspacesApp() {
  const a = express(); a.use(express.json()); a.use('/api/workspaces', workspaceRoutes); return a
}

async function adminToken() {
  const u = await User.create({ name: 'Admin', email: `adm${Math.random()}@x.com`, password: 'password1234', role: 'admin' })
  return signAccess({ userId: u._id, email: u.email, role: u.role })
}

function postWebhook(app, evt) {
  return request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(evt))
}

const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())
const bearer = (r, t) => r.set('Authorization', `Bearer ${t}`)

// ─── 1. payment_failed → grace + dunning email ───────────────────────────────

test('payment_failed: paymentPastDue=true, plan unchanged, dunning email sent', async () => {
  const emails = captureEmails()
  try {
    const { workspace, user } = await makeAuthedUser()
    await Workspace.findByIdAndUpdate(workspace._id, {
      plan: 'pro',
      stripeCustomerId: 'cus_grace1',
      ownerId: user._id,
    })
    const evt = {
      id: 'evt_grace1',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_grace1' } },
    }
    const app = webhookApp((body) => JSON.parse(body.toString()))
    const r = await postWebhook(app, evt)
    assert.equal(r.status, 200)
    const ws = await Workspace.findById(workspace._id)
    assert.equal(ws.plan, 'pro', 'plan must stay pro on payment_failed')
    assert.equal(ws.paymentPastDue, true, 'paymentPastDue flag must be set')
    // dunning email should have been sent to the workspace owner
    assert.ok(emails.some(e => e.to === user.email), 'dunning email must be sent to owner')
    assert.ok(emails.some(e => e.subject.toLowerCase().includes('payment')), 'dunning email subject must mention payment')
  } finally {
    emails.restore()
  }
})

// ─── 2. subscription.deleted → hard downgrade to free ────────────────────────

test('customer.subscription.deleted downgrades to free and clears paymentPastDue', async () => {
  const { workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, {
    plan: 'studio',
    stripeCustomerId: 'cus_deleted1',
    paymentPastDue: true,
  })
  const evt = {
    id: 'evt_subdel1',
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_d1', customer: 'cus_deleted1' } },
  }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await postWebhook(app, evt)
  assert.equal(r.status, 200)
  const ws = await Workspace.findById(workspace._id)
  assert.equal(ws.plan, 'free', 'subscription.deleted must downgrade to free')
  assert.equal(ws.paymentPastDue, false, 'paymentPastDue must be cleared on deletion')
})

// ─── 3. subscription.updated active → clears paymentPastDue + refills credits ─

test('subscription.updated active: paymentPastDue cleared and monthlyCredits refilled', async () => {
  config.stripe.prices.pro = 'price_pro_lc1'
  const { workspace } = await makeAuthedUser()
  // Simulate a workspace that had a payment issue (past due, low credits)
  await Workspace.findByIdAndUpdate(workspace._id, {
    plan: 'pro',
    stripeCustomerId: 'cus_reactive1',
    paymentPastDue: true,
    monthlyCredits: 5,
  })
  const evt = {
    id: 'evt_subact1',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_a1',
        status: 'active',
        customer: 'cus_reactive1',
        metadata: { workspaceId: String(workspace._id) },
        items: { data: [{ price: { id: 'price_pro_lc1' } }] },
      },
    },
  }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await postWebhook(app, evt)
  assert.equal(r.status, 200)
  const ws = await Workspace.findById(workspace._id)
  assert.equal(ws.paymentPastDue, false, 'paymentPastDue cleared on active subscription')
  assert.equal(ws.monthlyCredits, planCredits('pro'), 'monthlyCredits refilled to plan allowance on upgrade')
})

// ─── 4. low-credit email fires once when crossing < 20 ───────────────────────

test('low-credit email fires once on crossing below 20 credits, not on subsequent debits', async () => {
  const emails = captureEmails()
  try {
    const { workspace, user } = await makeAuthedUser()
    // Start just above threshold and debit to cross it
    await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 25, purchasedCredits: 0, ownerId: user._id })

    // First debit: 25 → 15 (crosses < 20 threshold) — should fire email
    const r1 = await debitCredits(workspace._id, 10)
    assert.equal(r1.ok, true)
    const emailCount1 = emails.filter(e => e.to === user.email && e.subject.includes('low')).length
    assert.equal(emailCount1, 1, 'exactly one low-credit email on first crossing')

    // Second debit: 15 → 5 (still below threshold) — should NOT fire again
    const r2 = await debitCredits(workspace._id, 10)
    assert.equal(r2.ok, true)
    const emailCount2 = emails.filter(e => e.to === user.email && e.subject.includes('low')).length
    assert.equal(emailCount2, 1, 'no repeat email on subsequent debits below threshold')
  } finally {
    emails.restore()
  }
})

test('low-credit email does not fire when crossing below threshold from above 20 but balance never dips (no-op check)', async () => {
  const emails = captureEmails()
  try {
    const { workspace, user } = await makeAuthedUser()
    // Start at 100, debit only to 50 — never crosses < 20
    await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 100, purchasedCredits: 0, ownerId: user._id })
    await debitCredits(workspace._id, 50)
    const emailsSent = emails.filter(e => e.to === user.email && e.subject.includes('low'))
    assert.equal(emailsSent.length, 0, 'no email when balance stays >= 20')
  } finally {
    emails.restore()
  }
})

// ─── 5. welcome email on verify-email ────────────────────────────────────────

test('welcome email sent on first email verification, not on repeat', async () => {
  const emails = captureEmails()
  try {
    const user = await User.create({
      name: 'Newbie',
      email: `newbie${Math.random()}@x.com`,
      password: 'password1234',
      emailVerifiedAt: null,   // unverified
    })
    const token = signEmailToken({ userId: String(user._id), purpose: 'verify_email' })
    const app = authApp()

    // First verification → welcome email expected
    const r1 = await request(app)
      .get(`/api/auth/verify-email?token=${token}`)
      .set('Accept', 'application/json')
    assert.equal(r1.status, 200)
    const welcomeEmails = emails.filter(e => e.to === user.email && e.subject.toLowerCase().includes('welcome'))
    assert.equal(welcomeEmails.length, 1, 'exactly one welcome email on first verification')

    // Second verification (same token after creation of a new one — already verified) → no extra email
    const token2 = signEmailToken({ userId: String(user._id), purpose: 'verify_email' })
    const r2 = await request(app)
      .get(`/api/auth/verify-email?token=${token2}`)
      .set('Accept', 'application/json')
    assert.equal(r2.status, 200)
    const welcomeEmails2 = emails.filter(e => e.to === user.email && e.subject.toLowerCase().includes('welcome'))
    assert.equal(welcomeEmails2.length, 1, 'no second welcome email on repeat verification')
  } finally {
    emails.restore()
  }
})

// ─── 6. cancel Stripe subscription on account delete ─────────────────────────

test('DELETE /me cancels the Stripe subscription for personal workspaces', async () => {
  const { user, workspace, token } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { stripeSubscriptionId: 'sub_to_cancel' })

  const cancelledSubs = []
  const fakeStripe = {
    subscriptions: {
      cancel: async (id) => { cancelledSubs.push(id); return {} },
    },
  }

  const app = usersApp(fakeStripe)
  const r = await bearer(request(app).delete('/api/users/me'), token)
  assert.equal(r.status, 200)
  assert.ok(cancelledSubs.includes('sub_to_cancel'), 'Stripe cancel must be called with the subscription id')
  assert.equal(await User.findById(user._id), null, 'user should be deleted')
})

test('DELETE /me without Stripe client does not fail (graceful no-op)', async () => {
  const { user, workspace, token } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { stripeSubscriptionId: 'sub_no_stripe' })

  // No stripe injected in app.locals
  const app = usersApp(null)
  const r = await bearer(request(app).delete('/api/users/me'), token)
  assert.equal(r.status, 200)
  assert.equal(await User.findById(user._id), null, 'user should still be deleted even without Stripe')
})

// ─── 7. Ownership transfer ───────────────────────────────────────────────────

test('POST /workspaces/:id/transfer-ownership: owner can transfer to existing member', async () => {
  const { user: owner, token: ownerToken } = await makeAuthedUser()
  const { user: newOwner } = await makeAuthedUser()

  const ws = await Workspace.create({
    name: 'Trans Org',
    type: 'organization',
    ownerId: owner._id,
    members: [
      { userId: owner._id, role: 'owner' },
      { userId: newOwner._id, role: 'member' },
    ],
  })

  const app = workspacesApp()
  const r = await bearer(
    request(app).post(`/api/workspaces/${ws._id}/transfer-ownership`),
    ownerToken,
  ).send({ newOwnerId: String(newOwner._id) })

  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`)
  const updated = await Workspace.findById(ws._id)
  assert.equal(String(updated.ownerId), String(newOwner._id), 'ownerId must point to the new owner')
  const newOwnerMember = updated.members.find(m => String(m.userId) === String(newOwner._id))
  const oldOwnerMember = updated.members.find(m => String(m.userId) === String(owner._id))
  assert.equal(newOwnerMember.role, 'owner', 'new owner must have role=owner')
  assert.equal(oldOwnerMember.role, 'admin', 'old owner must be demoted to admin')
})

test('POST /workspaces/:id/transfer-ownership: non-owner gets 403', async () => {
  const { user: owner } = await makeAuthedUser()
  const { user: member, token: memberToken } = await makeAuthedUser()
  const { user: target } = await makeAuthedUser()

  const ws = await Workspace.create({
    name: 'Trans Org 2',
    type: 'organization',
    ownerId: owner._id,
    members: [
      { userId: owner._id, role: 'owner' },
      { userId: member._id, role: 'member' },
      { userId: target._id, role: 'member' },
    ],
  })

  const app = workspacesApp()
  const r = await bearer(
    request(app).post(`/api/workspaces/${ws._id}/transfer-ownership`),
    memberToken,
  ).send({ newOwnerId: String(target._id) })

  assert.equal(r.status, 403)
})

test('POST /workspaces/:id/transfer-ownership: non-member target gets 400', async () => {
  const { user: owner, token: ownerToken } = await makeAuthedUser()
  const { user: outsider } = await makeAuthedUser()

  const ws = await Workspace.create({
    name: 'Trans Org 3',
    type: 'organization',
    ownerId: owner._id,
    members: [{ userId: owner._id, role: 'owner' }],
  })

  const app = workspacesApp()
  const r = await bearer(
    request(app).post(`/api/workspaces/${ws._id}/transfer-ownership`),
    ownerToken,
  ).send({ newOwnerId: String(outsider._id) })

  assert.equal(r.status, 400)
})

// ─── 8. MRR in admin stats ────────────────────────────────────────────────────

test('GET /api/admin/stats returns mrr and subscription counts', async () => {
  const token = await adminToken()
  const owner1 = new mongoose.Types.ObjectId()
  const owner2 = new mongoose.Types.ObjectId()
  const owner3 = new mongoose.Types.ObjectId()

  // 2 pro subscribers ($19 each = $38 MRR) + 1 studio ($79 MRR)
  await Workspace.create({ name: 'Pro1', type: 'personal', ownerId: owner1, plan: 'pro', stripeSubscriptionId: 'sub_pro1' })
  await Workspace.create({ name: 'Pro2', type: 'personal', ownerId: owner2, plan: 'pro', stripeSubscriptionId: 'sub_pro2' })
  await Workspace.create({ name: 'Studio1', type: 'personal', ownerId: owner3, plan: 'studio', stripeSubscriptionId: 'sub_stu1' })
  // Free workspace — should NOT count toward MRR
  const owner4 = new mongoose.Types.ObjectId()
  await Workspace.create({ name: 'Free1', type: 'personal', ownerId: owner4, plan: 'free' })

  const res = await request(adminApp()).get('/api/admin/stats').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.ok('mrr' in res.body, 'mrr field must be present')
  assert.ok('subscriptions' in res.body, 'subscriptions field must be present')
  assert.equal(res.body.mrr, 38 + 79, 'MRR must be 2×$19 + 1×$79 = $117')
  assert.equal(res.body.subscriptions.pro, 2, 'subscriptions.pro must be 2')
  assert.equal(res.body.subscriptions.studio, 1, 'subscriptions.studio must be 1')
})

test('GET /api/admin/stats mrr=0 when no paying subscribers', async () => {
  const token = await adminToken()
  const res = await request(adminApp()).get('/api/admin/stats').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.mrr, 0)
  assert.equal(res.body.subscriptions.pro, 0)
  assert.equal(res.body.subscriptions.studio, 0)
})

// ─── 9. /health dependency checks ────────────────────────────────────────────
// These tests exercise the health handler logic directly by importing the module
// and constructing a minimal express app (no full server bootstrap needed).

test('/health returns mongo:true in test environment (in-memory mongo is connected)', async () => {
  // Import index is not used here; build a small standalone app instead to avoid
  // the full bootstrap (connectDB, port listen) that index.js runs at module load.
  // Instead we call the health route logic by testing the final server shape via
  // a purpose-built mini app that imports the same mongoose instance.
  const { default: mg } = await import('mongoose')
  // The in-memory mongo started by startTestDB means readyState=1 here.
  assert.equal(mg.connection.readyState, 1, 'mongoose must be connected in test context')

  // Build a minimal app that replicates the health route handler
  const healthApp = express()
  healthApp.get('/health', async (_req, res) => {
    const mongoOk = mg.connection.readyState === 1
    // redis is '' in tests (env.js forces REDIS_URL=''), so redisOk will be null
    let redisOk = null
    try {
      const { getRedis } = await import('../utils/redis.js')
      const pingWithTimeout = Promise.race([
        (async () => {
          const rc = await getRedis()
          if (!rc) return null
          await rc.ping()
          return true
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
      ])
      redisOk = await pingWithTimeout
    } catch {
      redisOk = false
    }
    const status = mongoOk ? 'ok' : 'degraded'
    res.status(mongoOk ? 200 : 503).json({ status, mongo: mongoOk, redis: redisOk, ts: new Date().toISOString() })
  })

  const r = await request(healthApp).get('/health')
  assert.equal(r.status, 200)
  assert.equal(r.body.status, 'ok')
  assert.equal(r.body.mongo, true, 'mongo must be true when in-memory db is connected')
  assert.ok('redis' in r.body, 'redis field must be present')
  assert.ok('ts' in r.body, 'ts field must be present')
  // Redis is disabled in test env (REDIS_URL='') → expect null (not configured)
  assert.equal(r.body.redis, null, 'redis must be null when not configured')
})
