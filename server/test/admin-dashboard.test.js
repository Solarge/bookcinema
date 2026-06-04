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
import Job from '../models/Job.js'
import { signAccess } from '../utils/jwt.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/admin', adminRoutes)
  return a
}

async function adminToken() {
  const u = await User.create({ name: 'Admin', email: `a${Math.random()}@x.com`, password: 'password1234', role: 'admin' })
  return signAccess({ userId: u._id, email: u.email, role: u.role })
}

async function userToken() {
  const u = await User.create({ name: 'User', email: `u${Math.random()}@x.com`, password: 'password1234', role: 'user' })
  return signAccess({ userId: u._id, email: u.email, role: u.role })
}

// ─── GET /workspaces ────────────────────────────────────────────────────────

test('non-admin is rejected from GET /workspaces with 403', async () => {
  const token = await userToken()
  const res = await request(app()).get('/api/admin/workspaces').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 403)
})

test('GET /workspaces returns workspace list with correct fields', async () => {
  const token = await adminToken()
  const owner = new mongoose.Types.ObjectId()
  await Workspace.create({
    name: 'Alpha Team',
    type: 'organization',
    ownerId: owner,
    plan: 'pro',
    monthlyCredits: 200,
    purchasedCredits: 50,
    members: [{ userId: owner, role: 'owner' }, { userId: new mongoose.Types.ObjectId(), role: 'member' }],
  })
  const res = await request(app()).get('/api/admin/workspaces').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.ok(Array.isArray(res.body.workspaces))
  assert.equal(res.body.workspaces.length, 1)
  const w = res.body.workspaces[0]
  assert.equal(w.name, 'Alpha Team')
  assert.equal(w.plan, 'pro')
  assert.equal(w.memberCount, 2)
  assert.equal(w.creditBalance, 250)
  assert.ok('monthlyCredits' in w)
  assert.ok('purchasedCredits' in w)
  assert.ok('stripeSubscriptionId' in w)
  assert.ok('ownerId' in w)
  assert.ok('createdAt' in w)
})

test('GET /workspaces search filters by name', async () => {
  const token = await adminToken()
  const oid = new mongoose.Types.ObjectId()
  await Workspace.create({ name: 'Searchable Workspace', type: 'personal', ownerId: oid })
  await Workspace.create({ name: 'Other Workspace', type: 'personal', ownerId: oid })
  const res = await request(app()).get('/api/admin/workspaces?search=Searchable').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.workspaces.length, 1)
  assert.equal(res.body.workspaces[0].name, 'Searchable Workspace')
})

test('GET /workspaces search with regex metacharacters does not crash', async () => {
  const token = await adminToken()
  const res = await request(app()).get('/api/admin/workspaces?search=te(st[+').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.ok(Array.isArray(res.body.workspaces))
})

test('GET /workspaces with no search returns all workspaces (newest first)', async () => {
  const token = await adminToken()
  const oid = new mongoose.Types.ObjectId()
  await Workspace.create({ name: 'First', type: 'personal', ownerId: oid })
  await Workspace.create({ name: 'Second', type: 'personal', ownerId: oid })
  const res = await request(app()).get('/api/admin/workspaces').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.workspaces.length, 2)
  // Newest first — Second was created after First
  assert.equal(res.body.workspaces[0].name, 'Second')
})

// ─── GET /jobs ───────────────────────────────────────────────────────────────

test('non-admin is rejected from GET /jobs with 403', async () => {
  const token = await userToken()
  const res = await request(app()).get('/api/admin/jobs').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 403)
})

test('GET /jobs returns recent platform-wide jobs', async () => {
  const token = await adminToken()
  const wid = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()
  await Job.create({ workspaceId: wid, createdBy: uid, type: 'image', tier: 'standard', status: 'done', costUsd: 0.003 })
  await Job.create({ workspaceId: wid, createdBy: uid, type: 'text',  tier: 'premium', status: 'queued' })
  const res = await request(app()).get('/api/admin/jobs').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.ok(Array.isArray(res.body.jobs))
  assert.equal(res.body.jobs.length, 2)
  assert.ok('summary' in res.body)
  const j = res.body.jobs[0]
  assert.ok('workspaceId' in j)
  assert.ok('type' in j)
  assert.ok('status' in j)
  assert.ok('createdAt' in j)
})

test('GET /jobs respects status filter', async () => {
  const token = await adminToken()
  const wid = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()
  await Job.create({ workspaceId: wid, createdBy: uid, type: 'image', status: 'done' })
  await Job.create({ workspaceId: wid, createdBy: uid, type: 'text',  status: 'failed', errorMessage: 'out of credits' })
  const res = await request(app()).get('/api/admin/jobs?status=failed').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.jobs.length, 1)
  assert.equal(res.body.jobs[0].status, 'failed')
})

test('GET /jobs respects type filter', async () => {
  const token = await adminToken()
  const wid = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()
  await Job.create({ workspaceId: wid, createdBy: uid, type: 'video', status: 'done' })
  await Job.create({ workspaceId: wid, createdBy: uid, type: 'voice', status: 'done' })
  const res = await request(app()).get('/api/admin/jobs?type=video').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.jobs.length, 1)
  assert.equal(res.body.jobs[0].type, 'video')
})

test('GET /jobs respects limit param (capped at 200)', async () => {
  const token = await adminToken()
  const wid = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()
  await Promise.all(Array.from({ length: 5 }, () =>
    Job.create({ workspaceId: wid, createdBy: uid, type: 'text', status: 'done' })
  ))
  const res = await request(app()).get('/api/admin/jobs?limit=3').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.jobs.length, 3)
})

test('GET /jobs summary includes counts by status', async () => {
  const token = await adminToken()
  const wid = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()
  await Job.create({ workspaceId: wid, createdBy: uid, type: 'image', status: 'done' })
  await Job.create({ workspaceId: wid, createdBy: uid, type: 'text',  status: 'failed' })
  await Job.create({ workspaceId: wid, createdBy: uid, type: 'voice', status: 'queued' })
  const res = await request(app()).get('/api/admin/jobs').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const { summary } = res.body
  assert.ok('done' in summary)
  assert.ok('failed' in summary)
  assert.ok('queued' in summary)
  assert.ok('active' in summary)
  assert.equal(summary.done, 1)
  assert.equal(summary.failed, 1)
  assert.equal(summary.queued, 1)
})

// ─── GET /config ─────────────────────────────────────────────────────────────

test('non-admin is rejected from GET /config with 403', async () => {
  const token = await userToken()
  const res = await request(app()).get('/api/admin/config').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 403)
})

test('GET /config returns providers, managed, stripe, plans, redis without secret values', async () => {
  const token = await adminToken()
  const res = await request(app()).get('/api/admin/config').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const body = res.body

  // providers array present
  assert.ok(Array.isArray(body.providers))
  for (const p of body.providers) {
    assert.ok(typeof p.provider === 'string')
    assert.ok(typeof p.configured === 'boolean')
  }

  // social array present
  assert.ok(Array.isArray(body.social))
  for (const s of body.social) {
    assert.ok(typeof s.key === 'string')
    assert.ok(typeof s.configured === 'boolean')
  }

  // managed guardrails present with correct shape
  const m = body.managed
  assert.ok(typeof m.enabled === 'boolean')
  assert.ok(typeof m.maxConcurrent === 'number')
  assert.ok(typeof m.starterCredits === 'number')
  assert.ok(typeof m.caps === 'object')
  assert.ok(typeof m.caps.text === 'number')
  assert.ok(typeof m.caps.image === 'number')
  assert.ok(typeof m.caps.voice === 'number')

  // stripe — booleans only
  const s = body.stripe
  assert.ok(typeof s.configured === 'boolean')
  assert.ok(typeof s.pricesConfigured === 'object')
  for (const v of Object.values(s.pricesConfigured)) {
    assert.ok(typeof v === 'boolean')
  }

  // redis — boolean only
  assert.ok(typeof body.redis.configured === 'boolean')

  // plans present with expected plan keys
  const { plans } = body
  assert.ok(plans.free)
  assert.ok(plans.pro)
  assert.ok(plans.studio)
})

test('GET /config plans has credits and features per plan', async () => {
  const token = await adminToken()
  const res = await request(app()).get('/api/admin/config').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const { plans } = res.body
  assert.ok(typeof plans.free.credits === 'number')
  assert.ok(typeof plans.pro.credits === 'number')
  assert.ok(typeof plans.studio.credits === 'number')
  assert.ok(typeof plans.free.features === 'object')
})

test('GET /config does not leak secret key values', async () => {
  const token = await adminToken()
  const res = await request(app()).get('/api/admin/config').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const raw = JSON.stringify(res.body)

  // stripe.configured must be a boolean (never the actual key string)
  assert.ok(typeof res.body.stripe.configured === 'boolean', 'stripe.configured must be a boolean')
  // pricesConfigured values must all be booleans
  for (const v of Object.values(res.body.stripe.pricesConfigured)) {
    assert.ok(typeof v === 'boolean', 'each pricesConfigured value must be a boolean')
  }

  // Verify no actual secret key values appear in the JSON response.
  // We do this by checking known non-empty test env values do not appear as raw strings.
  // JWT_SECRET is set in helpers/env.js — its value must NOT be in the response body.
  const knownTestSecret = 'test_jwt_secret_at_least_32_characters_long_x'
  assert.ok(!raw.includes(knownTestSecret), 'JWT_SECRET value must not appear in /config response')

  // The env var *names* should not appear as response values (only as keys in our own shape)
  const secretVarNames = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'JWT_SECRET', 'JWT_REFRESH_SECRET']
  for (const name of secretVarNames) {
    // They should not appear as standalone JSON string values
    assert.ok(!raw.includes(`"${name}"`), `Env var name ${name} should not be leaked as a JSON value`)
  }

  // Verify that raw secret strings from config.stripe are not present (they may be set)
  // The response must only contain booleans for stripe fields, not the key strings themselves.
  // Assert that the stripe object has no string fields that look like API keys (sk_*)
  const stripeObj = JSON.stringify(res.body.stripe)
  assert.ok(!stripeObj.includes('sk_'), 'Stripe secret key must not appear in stripe config response')
  assert.ok(!stripeObj.includes('whsec_'), 'Stripe webhook secret must not appear in stripe config response')
})

// ─── GET /stats (expanded) ──────────────────────────────────────────────────

test('non-admin is rejected from GET /stats with 403', async () => {
  const token = await userToken()
  const res = await request(app()).get('/api/admin/stats').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 403)
})

test('GET /stats includes workspaces and jobs counts', async () => {
  const token = await adminToken()
  const oid = new mongoose.Types.ObjectId()
  await Workspace.create({ name: 'W1', type: 'personal', ownerId: oid })
  await Workspace.create({ name: 'W2', type: 'personal', ownerId: oid })
  const uid = new mongoose.Types.ObjectId()
  await Job.create({ workspaceId: oid, createdBy: uid, type: 'image', status: 'done' })
  await Job.create({ workspaceId: oid, createdBy: uid, type: 'text',  status: 'failed' })
  const res = await request(app()).get('/api/admin/stats').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.workspaces, 2)
  assert.ok(typeof res.body.jobs === 'object')
  assert.equal(res.body.jobs.total, 2)
  assert.ok('byStatus' in res.body.jobs)
  assert.equal(res.body.jobs.byStatus.done, 1)
  assert.equal(res.body.jobs.byStatus.failed, 1)
})

test('GET /stats still returns existing fields (users, series, totalCostUsd)', async () => {
  const token = await adminToken()
  const res = await request(app()).get('/api/admin/stats').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.ok('users' in res.body)
  assert.ok('series' in res.body)
  assert.ok('totalCostUsd' in res.body)
  assert.ok('workspaces' in res.body)
  assert.ok('jobs' in res.body)
})
