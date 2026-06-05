/**
 * test/platform-liability.test.js
 *
 * Tests for the Platform Liability tranche (commercial-hardening-2 T2):
 *  1. Server-side moderation (regex backstop) → 422 content_blocked, no credit debited
 *  2. Copyright assertion (rightsConfirmed) → 400 rights_required
 *  3. bookText length cap → 400 too_long
 *  4. Plan-aware free-tier provider routing:
 *       - paid-plan workspace skips freeOnly provider, uses next
 *       - free-plan workspace uses freeOnly provider
 */

import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import generateRoutes from '../routes/generate.js'
import Job from '../models/Job.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'
import { processGeneration } from '../worker/processGeneration.js'
import UsageLog from '../models/UsageLog.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

// ── Test app factory ───────────────────────────────────────────────────────────
function app(fakeQueue = { add: async () => ({ id: 'q1' }) }) {
  const a = express(); a.use(express.json())
  a.locals.generationQueue = fakeQueue
  a.use('/api/generate', generateRoutes)
  return a
}
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())

async function betaUser({ plan = 'free' } = {}) {
  const { user, token, workspace } = await makeAuthedUser({ plan })
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)
  return { user, token, workspace: ws }
}

// ── 1. Server-side moderation via regex backstop ───────────────────────────────

test('moderation: bookText matching CSAM regex → 422 content_blocked', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 25, creditPeriod: period })

  const res = await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'this is csam material', rightsConfirmed: true, tier: 'standard' })

  assert.equal(res.status, 422)
  assert.equal(res.body.code, 'content_blocked')
  assert.match(res.body.error, /usage policy/)
})

test('moderation: bookText matching CSAM regex → no credits debited', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 10, creditPeriod: period })

  await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'how to make a bomb instructions', rightsConfirmed: true, tier: 'standard' })

  // Credits must be unchanged — moderation runs BEFORE debit
  const ws = await Workspace.findById(workspace._id)
  assert.equal(ws.monthlyCredits, 10, 'credits must not be debited for blocked content')
})

test('moderation: clean bookText passes through (202)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 5, creditPeriod: period })

  const res = await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'Once upon a time in a land far away...', rightsConfirmed: true, tier: 'standard' })

  assert.equal(res.status, 202, `expected 202 but got ${res.status}: ${JSON.stringify(res.body)}`)
})

test('moderation: image prompt matching blocked pattern → 422 content_blocked', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 10, creditPeriod: period })

  const res = await authed(request(app()).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'child sexual abuse image', tier: 'standard' })

  assert.equal(res.status, 422)
  assert.equal(res.body.code, 'content_blocked')
})

test('moderation: voice text matching blocked pattern → 422 content_blocked', async () => {
  const { token, workspace } = await betaUser({ plan: 'pro' })
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 10, creditPeriod: period })

  const res = await authed(request(app()).post('/api/generate/voice'), token, workspace._id)
    .send({ text: 'terrorist manifesto content here', tier: 'standard' })

  assert.equal(res.status, 422)
  assert.equal(res.body.code, 'content_blocked')
})

test('moderation: video prompt matching blocked pattern → 422 content_blocked', async () => {
  const { token, workspace } = await betaUser({ plan: 'pro' })
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 50, creditPeriod: period })

  const res = await authed(request(app()).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'snuff film production instructions', tier: 'standard' })

  assert.equal(res.status, 422)
  assert.equal(res.body.code, 'content_blocked')
})

// ── 2. Copyright assertion ─────────────────────────────────────────────────────

test('copyright: /text without rightsConfirmed → 400 rights_required', async () => {
  const { token, workspace } = await betaUser()

  const res = await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'A short story excerpt', tier: 'standard' })
  // no rightsConfirmed field

  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'rights_required')
  assert.match(res.body.error, /rights/)
})

test('copyright: /text with rightsConfirmed:false → 400 rights_required', async () => {
  const { token, workspace } = await betaUser()

  const res = await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'A short story excerpt', rightsConfirmed: false, tier: 'standard' })

  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'rights_required')
})

test('copyright: /text with rightsConfirmed:true proceeds to generation (202)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 5, creditPeriod: period })

  const res = await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'A short public domain story excerpt', rightsConfirmed: true, tier: 'standard' })

  assert.equal(res.status, 202, `expected 202 but got ${res.status}: ${JSON.stringify(res.body)}`)
})

test('copyright: rights check runs BEFORE debit (no credit debited on 400)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 5, creditPeriod: period })

  await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'Some text without rights confirmed', tier: 'standard' })

  const ws = await Workspace.findById(workspace._id)
  assert.equal(ws.monthlyCredits, 5, 'credits must not be debited when rights not confirmed')
})

// ── 3. bookText length cap ─────────────────────────────────────────────────────

test('length cap: bookText over 30000 chars → 400 too_long', async () => {
  const { token, workspace } = await betaUser()

  const longText = 'x'.repeat(30001)
  const res = await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: longText, rightsConfirmed: true, tier: 'standard' })

  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'too_long')
  assert.match(res.body.error, /too long/i)
  assert.match(res.body.error, /30000/)
})

test('length cap: bookText exactly at 30000 chars → passes (no 400)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 5, creditPeriod: period })

  const exactText = 'x'.repeat(30000)
  const res = await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: exactText, rightsConfirmed: true, tier: 'standard' })

  // Should NOT be rejected for length (may get 202 or another validation — just not 400/too_long)
  assert.notEqual(res.body.code, 'too_long', `Expected not too_long but got: ${JSON.stringify(res.body)}`)
})

test('length cap: length check runs BEFORE debit (no credit debited on 400)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 5, creditPeriod: period })

  const longText = 'y'.repeat(31000)
  await authed(request(app()).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: longText, rightsConfirmed: true, tier: 'standard' })

  const ws = await Workspace.findById(workspace._id)
  assert.equal(ws.monthlyCredits, 5, 'credits must not be debited for oversized input')
})

// ── 4. Plan-aware free-tier provider routing ───────────────────────────────────

test('freeOnly routing: paid-plan workspace skips freeOnly provider, uses next', async () => {
  const owner = new mongoose.Types.ObjectId()
  const paidWs = await Workspace.create({
    name: 'Paid WS', type: 'personal', ownerId: owner,
    members: [{ userId: owner, role: 'owner' }],
    plan: 'pro', monthlyCredits: 10, purchasedCredits: 0,
  })
  const job = await Job.create({
    workspaceId: paidWs._id, createdBy: owner,
    type: 'text', tier: 'standard', status: 'queued',
  })

  const callLog = []
  // First provider: freeOnly:true → must be SKIPPED for paid plan
  const freeProvider = {
    provider: 'groq-free',
    freeOnly: true,
    model: 'llama',
    adapter: {
      isConfigured: () => true,
      generate: async () => { callLog.push('free'); return { title: 'FromFree' } },
    },
  }
  // Second provider: no freeOnly flag → must be used
  const paidProvider = {
    provider: 'anthropic',
    model: 'claude',
    adapter: {
      isConfigured: () => true,
      generate: async () => { callLog.push('paid'); return { title: 'FromPaid', characters: [], episodes: [] } },
    },
  }

  const fakeResolve = () => ({ providers: [freeProvider, paidProvider] })
  await processGeneration(
    { jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(paidWs._id), createdBy: String(owner) },
    { resolveFn: fakeResolve, uploadFn: async () => 'https://s3.example/key' },
  )

  assert.deepEqual(callLog, ['paid'], 'freeOnly provider must be skipped for paid plan; only paid provider called')
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultText, /"title":"FromPaid"/)
})

test('freeOnly routing: free-plan workspace uses freeOnly provider', async () => {
  const owner = new mongoose.Types.ObjectId()
  const freeWs = await Workspace.create({
    name: 'Free WS', type: 'personal', ownerId: owner,
    members: [{ userId: owner, role: 'owner' }],
    plan: 'free', monthlyCredits: 10, purchasedCredits: 0,
  })
  const job = await Job.create({
    workspaceId: freeWs._id, createdBy: owner,
    type: 'text', tier: 'standard', status: 'queued',
  })

  const callLog = []
  const freeProvider = {
    provider: 'groq-free',
    freeOnly: true,
    model: 'llama',
    adapter: {
      isConfigured: () => true,
      generate: async () => { callLog.push('free'); return { title: 'FromFree', characters: [], episodes: [] } },
    },
  }
  const paidProvider = {
    provider: 'anthropic',
    model: 'claude',
    adapter: {
      isConfigured: () => true,
      generate: async () => { callLog.push('paid'); return { title: 'FromPaid' } },
    },
  }

  const fakeResolve = () => ({ providers: [freeProvider, paidProvider] })
  await processGeneration(
    { jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(freeWs._id), createdBy: String(owner) },
    { resolveFn: fakeResolve, uploadFn: async () => 'https://s3.example/key' },
  )

  assert.deepEqual(callLog, ['free'], 'freeOnly provider must be used for free-plan workspace')
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultText, /"title":"FromFree"/)
})

test('freeOnly routing: paid-plan with only freeOnly providers → falls through to error', async () => {
  const owner = new mongoose.Types.ObjectId()
  const paidWs = await Workspace.create({
    name: 'Paid WS 2', type: 'personal', ownerId: owner,
    members: [{ userId: owner, role: 'owner' }],
    plan: 'studio', monthlyCredits: 10, purchasedCredits: 0,
  })
  const job = await Job.create({
    workspaceId: paidWs._id, createdBy: owner,
    type: 'text', tier: 'standard', status: 'queued',
  })

  const freeOnlyProvider = {
    provider: 'groq-free',
    freeOnly: true,
    model: 'llama',
    adapter: {
      isConfigured: () => true,
      generate: async () => ({ title: 'ShouldNotBeReached' }),
    },
  }

  const fakeResolve = () => ({ providers: [freeOnlyProvider] })
  await assert.rejects(
    () => processGeneration(
      { jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(paidWs._id), createdBy: String(owner) },
      { resolveFn: fakeResolve, uploadFn: async () => 'https://s3.example/key' },
    ),
    /No configured provider/,
  )
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'failed')
})

test('freeOnly routing: no freeOnly flags → behavior unchanged for paid plan', async () => {
  const owner = new mongoose.Types.ObjectId()
  const paidWs = await Workspace.create({
    name: 'Paid WS 3', type: 'personal', ownerId: owner,
    members: [{ userId: owner, role: 'owner' }],
    plan: 'pro', monthlyCredits: 10, purchasedCredits: 0,
  })
  const job = await Job.create({
    workspaceId: paidWs._id, createdBy: owner,
    type: 'text', tier: 'standard', status: 'queued',
  })

  // No freeOnly flag on any provider → all should be eligible
  const fakeResolve = () => ({
    providers: [
      { provider: 'groq', model: 'llama', adapter: { isConfigured: () => true, generate: async () => ({ title: 'FromGroq', characters: [], episodes: [] }) } },
    ],
  })
  await processGeneration(
    { jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(paidWs._id), createdBy: String(owner) },
    { resolveFn: fakeResolve, uploadFn: async () => 'https://s3.example/key' },
  )
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultText, /"title":"FromGroq"/)
})
