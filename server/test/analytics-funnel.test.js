import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import { track } from '../utils/track.js'
import AnalyticsEvent from '../models/AnalyticsEvent.js'
import authRoutes from '../routes/auth.js'
import generateRoutes from '../routes/generate.js'
import adminRoutes from '../routes/admin.js'
import { billingRouter, webhookHandler } from '../routes/billing.js'
import User from '../models/User.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'
import { signAccess, signEmailToken } from '../utils/jwt.js'
import { config } from '../config.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

// ── App factories ─────────────────────────────────────────────────────────────

function authApp() {
  const a = express(); a.use(express.json()); a.use(cookieParser()); a.use('/api/auth', authRoutes); return a
}

function generateApp(fakeQueue) {
  const a = express(); a.use(express.json())
  if (fakeQueue) a.locals.generationQueue = fakeQueue
  a.use('/api/generate', generateRoutes); return a
}

function adminApp() {
  const a = express(); a.use(express.json()); a.use('/api/admin', adminRoutes); return a
}

function webhookApp(constructEvent) {
  const a = express()
  a.locals.constructEvent = constructEvent
  a.post('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler)
  return a
}

async function adminToken() {
  const u = await User.create({ name: 'Admin', email: `adm${Math.random()}@x.com`, password: 'password1234', role: 'admin' })
  return signAccess({ userId: u._id, email: u.email, role: u.role })
}

async function userToken() {
  const u = await User.create({ name: 'User', email: `u${Math.random()}@x.com`, password: 'password1234', role: 'user' })
  return signAccess({ userId: u._id, email: u.email, role: u.role })
}

const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())
const bearer = (r, t) => r.set('Authorization', `Bearer ${t}`)

function postWebhook(app, evt) {
  return request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(evt))
}

// ── track() unit tests ────────────────────────────────────────────────────────

test('track() creates an AnalyticsEvent document', async () => {
  const userId = new mongoose.Types.ObjectId()
  await track('signup', { userId, props: { test: true } })
  const ev = await AnalyticsEvent.findOne({ event: 'signup', userId })
  assert.ok(ev, 'event document must be created')
  assert.equal(ev.event, 'signup')
  assert.deepEqual(ev.props, { test: true })
})

test('track() is best-effort: a bad call (undefined model method) does not throw', async () => {
  // Simulate failure by passing a non-objectId userId that would cause a cast error
  // track() must catch and NOT throw
  let threw = false
  try {
    await track('signup', { userId: 'not-an-objectid', props: {} })
  } catch {
    threw = true
  }
  assert.equal(threw, false, 'track() must never throw')
})

test('track() with no options creates event with null userId/workspaceId', async () => {
  await track('system_event')
  const ev = await AnalyticsEvent.findOne({ event: 'system_event' })
  assert.ok(ev)
  assert.equal(ev.userId, null)
  assert.equal(ev.workspaceId, null)
})

// ── Register → signup event ───────────────────────────────────────────────────

test('POST /api/auth/register emits a signup event on success', async () => {
  // Suppress email send in test
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'e1' }), text: async () => 'ok' })
  process.env.RESEND_API_KEY = 're_test_funnel'

  try {
    const r = await request(authApp())
      .post('/api/auth/register')
      .send({ name: 'Funnel User', email: `fu${Math.random()}@x.com`, password: 'password1234', consent: true, ageConfirmed: true })
    assert.equal(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`)

    const ev = await AnalyticsEvent.findOne({ event: 'signup' })
    assert.ok(ev, 'signup event must exist after register')
    assert.ok(ev.userId, 'signup event must have userId')
  } finally {
    globalThis.fetch = realFetch
    delete process.env.RESEND_API_KEY
  }
})

// ── Verify-email → email_verified event (first time only) ────────────────────

test('GET /api/auth/verify-email emits email_verified on first verification', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'e1' }), text: async () => 'ok' })
  process.env.RESEND_API_KEY = 're_test_funnel'

  try {
    const user = await User.create({
      name: 'VUser', email: `v${Math.random()}@x.com`, password: 'password1234', emailVerifiedAt: null,
    })
    const token = signEmailToken({ userId: String(user._id), purpose: 'verify_email' })
    const r = await request(authApp())
      .get(`/api/auth/verify-email?token=${token}`)
      .set('Accept', 'application/json')
    assert.equal(r.status, 200)

    const ev = await AnalyticsEvent.findOne({ event: 'email_verified', userId: user._id })
    assert.ok(ev, 'email_verified event must exist after first verification')
  } finally {
    globalThis.fetch = realFetch
    delete process.env.RESEND_API_KEY
  }
})

test('GET /api/auth/verify-email does NOT emit email_verified on repeat verification', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'e1' }), text: async () => 'ok' })
  process.env.RESEND_API_KEY = 're_test_funnel'

  try {
    const user = await User.create({
      name: 'VUser2', email: `v2${Math.random()}@x.com`, password: 'password1234', emailVerifiedAt: new Date(), // already verified
    })
    const token = signEmailToken({ userId: String(user._id), purpose: 'verify_email' })
    const r = await request(authApp())
      .get(`/api/auth/verify-email?token=${token}`)
      .set('Accept', 'application/json')
    assert.equal(r.status, 200)

    const count = await AnalyticsEvent.countDocuments({ event: 'email_verified', userId: user._id })
    assert.equal(count, 0, 'email_verified must NOT be emitted when user was already verified')
  } finally {
    globalThis.fetch = realFetch
    delete process.env.RESEND_API_KEY
  }
})

// ── Generation enqueue → generation event ────────────────────────────────────

test('POST /api/generate/text emits a generation event on success', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)

  const fakeQueue = { add: async () => ({ id: 'b1' }) }
  const res = await authed(request(generateApp(fakeQueue)).post('/api/generate/text'), token, ws._id)
    .send({ bookText: 'Once upon a time', genrePreset: 'cinematic', language: 'en', tier: 'standard', rightsConfirmed: true })
  assert.equal(res.status, 202, `expected 202 got ${res.status}: ${JSON.stringify(res.body)}`)

  const ev = await AnalyticsEvent.findOne({ event: 'generation', userId: user._id })
  assert.ok(ev, 'generation event must exist after enqueue')
  assert.equal(ev.props.type, 'text')
  assert.equal(ev.props.tier, 'standard')
  assert.ok(ev.workspaceId, 'generation event must have workspaceId')
})

test('POST /api/generate/image emits a generation event on success', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)

  const fakeQueue = { add: async () => ({ id: 'b2' }) }
  const res = await authed(request(generateApp(fakeQueue)).post('/api/generate/image'), token, ws._id)
    .send({ prompt: 'a dramatic cliffside', tier: 'standard' })
  assert.equal(res.status, 202)

  const ev = await AnalyticsEvent.findOne({ event: 'generation', userId: user._id })
  assert.ok(ev, 'generation event must exist after image enqueue')
  assert.equal(ev.props.type, 'image')
})

// ── Billing webhook → plan_upgraded event ────────────────────────────────────

test('customer.subscription.updated active+paid emits plan_upgraded event', async () => {
  config.stripe.prices.pro = 'price_pro_funnel1'
  const { workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { stripeCustomerId: 'cus_funnel1' })

  const evt = {
    id: 'evt_funnel_sub1',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_funnel1',
        status: 'active',
        customer: 'cus_funnel1',
        metadata: { workspaceId: String(workspace._id) },
        items: { data: [{ price: { id: 'price_pro_funnel1' } }] },
      },
    },
  }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await postWebhook(app, evt)
  assert.equal(r.status, 200)

  const ev = await AnalyticsEvent.findOne({ event: 'plan_upgraded' })
  assert.ok(ev, 'plan_upgraded event must exist after active subscription webhook')
  assert.equal(ev.props.plan, 'pro')
})

test('customer.subscription.updated cancelled (inactive) does NOT emit plan_upgraded', async () => {
  config.stripe.prices.pro = 'price_pro_funnel2'
  const { workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { stripeCustomerId: 'cus_funnel2' })

  const evt = {
    id: 'evt_funnel_sub2',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_funnel2',
        status: 'canceled',
        customer: 'cus_funnel2',
        metadata: { workspaceId: String(workspace._id) },
        items: { data: [{ price: { id: 'price_pro_funnel2' } }] },
      },
    },
  }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await postWebhook(app, evt)
  assert.equal(r.status, 200)

  const count = await AnalyticsEvent.countDocuments({ event: 'plan_upgraded' })
  assert.equal(count, 0, 'plan_upgraded must NOT be emitted for canceled subscription')
})

// ── GET /api/admin/funnel ─────────────────────────────────────────────────────

test('GET /api/admin/funnel returns 403 for non-admin', async () => {
  const token = await userToken()
  const r = await bearer(request(adminApp()).get('/api/admin/funnel'), token)
  assert.equal(r.status, 403)
})

test('GET /api/admin/funnel returns 4-stage funnel with counts and rates', async () => {
  const token = await adminToken()
  const uid1 = new mongoose.Types.ObjectId()
  const uid2 = new mongoose.Types.ObjectId()
  const uid3 = new mongoose.Types.ObjectId()

  // Seed events: 3 signups, 2 verified, 2 activated, 1 upgraded
  await AnalyticsEvent.create([
    { event: 'signup',        userId: uid1 },
    { event: 'signup',        userId: uid2 },
    { event: 'signup',        userId: uid3 },
    { event: 'email_verified', userId: uid1 },
    { event: 'email_verified', userId: uid2 },
    { event: 'generation',    userId: uid1, workspaceId: new mongoose.Types.ObjectId() },
    { event: 'generation',    userId: uid2, workspaceId: new mongoose.Types.ObjectId() },
    { event: 'plan_upgraded', userId: uid1 },
  ])

  const r = await bearer(request(adminApp()).get('/api/admin/funnel?days=30'), token)
  assert.equal(r.status, 200)

  const { funnel, window: win } = r.body
  assert.ok(Array.isArray(funnel), 'funnel must be an array')
  assert.equal(funnel.length, 4, 'funnel must have 4 stages')

  const [signup, verified, activated, upgraded] = funnel
  assert.equal(signup.stage,   'signup')
  assert.equal(signup.count,   3)
  assert.equal(signup.rate,    null, 'first stage rate must be null (no prior stage)')

  assert.equal(verified.stage,  'email_verified')
  assert.equal(verified.count,  2)
  assert.ok(verified.rate != null, 'verified rate must not be null')
  // 2/3 = 66.67%
  assert.ok(verified.rate > 60 && verified.rate < 70, `verified rate should be ~66.67, got ${verified.rate}`)

  assert.equal(activated.stage, 'activated')
  assert.equal(activated.count, 2)
  // 2/2 = 100%
  assert.equal(activated.rate, 100)

  assert.equal(upgraded.stage, 'upgraded')
  assert.equal(upgraded.count, 1)
  // 1/2 = 50%
  assert.equal(upgraded.rate, 50)

  assert.ok(win, 'window metadata must be present')
  assert.equal(win.days, 30)
})

test('GET /api/admin/funnel handles empty data (all zeros, no divide-by-zero)', async () => {
  const token = await adminToken()
  const r = await bearer(request(adminApp()).get('/api/admin/funnel'), token)
  assert.equal(r.status, 200)

  const { funnel } = r.body
  assert.equal(funnel.length, 4)
  for (const stage of funnel) {
    assert.equal(stage.count, 0)
    // rate is null when denominator is 0 (no divide-by-zero)
    assert.ok(stage.rate === null, `rate must be null when count is 0 (got ${stage.rate} for ${stage.stage})`)
  }
})

test('GET /api/admin/funnel respects the days window — old events are excluded', async () => {
  const token = await adminToken()
  const uid1 = new mongoose.Types.ObjectId()

  // Old event (60 days ago) — outside a 30-day window
  const oldDate = new Date(Date.now() - 60 * 86400000)
  await AnalyticsEvent.create({ event: 'signup', userId: uid1, createdAt: oldDate })

  // Recent event
  await AnalyticsEvent.create({ event: 'signup', userId: new mongoose.Types.ObjectId() })

  const r = await bearer(request(adminApp()).get('/api/admin/funnel?days=30'), token)
  assert.equal(r.status, 200)

  const signup = r.body.funnel.find(s => s.stage === 'signup')
  assert.equal(signup.count, 1, 'only the recent signup must be counted within the 30-day window')
})

test('GET /api/admin/funnel deduplicates users (multiple generation events count once)', async () => {
  const token = await adminToken()
  const uid = new mongoose.Types.ObjectId()
  const wid = new mongoose.Types.ObjectId()

  // Same user fires 3 generation events — should count as 1 activated user
  await AnalyticsEvent.create([
    { event: 'generation', userId: uid, workspaceId: wid },
    { event: 'generation', userId: uid, workspaceId: wid },
    { event: 'generation', userId: uid, workspaceId: wid },
  ])

  const r = await bearer(request(adminApp()).get('/api/admin/funnel'), token)
  assert.equal(r.status, 200)

  const activated = r.body.funnel.find(s => s.stage === 'activated')
  assert.equal(activated.count, 1, 'multiple generation events by the same user must count as 1 activated user')
})

test('GET /api/admin/funnel window metadata has correct days and since fields', async () => {
  const token = await adminToken()
  const r = await bearer(request(adminApp()).get('/api/admin/funnel?days=7'), token)
  assert.equal(r.status, 200)
  const { window: win } = r.body
  assert.equal(win.days, 7)
  assert.ok(win.since, 'since must be present')
  const since = new Date(win.since)
  // should be approximately 7 days ago (within 5 seconds of tolerance)
  const expected = Date.now() - 7 * 86400000
  assert.ok(Math.abs(since.getTime() - expected) < 5000, 'since date must be ~7 days ago')
})
