/**
 * money-safety-net.test.js
 *
 * Tests for the "Money Safety Net" tranche (commercial-hardening-2 T1):
 *   1. estCostUsd recorded on Job at creation.
 *   2. Video credits re-priced to 40 (standard) / 80 (premium).
 *   3. Platform-wide daily $ spend kill-switch (503 spend_cap when over cap).
 *   4. Generate 202 returns creditsCharged + creditsRemaining.
 *   5. GET /api/generate/estimate returns credits + estCostUsd.
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
import { estCostFor } from '../generation/registry.js'
import { creditCost } from '../generation/creditCost.js'
import { managedAccess } from '../middleware/managedAccess.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

// ── app factory ────────────────────────────────────────────────────────────
function app(fakeQueue) {
  const a = express(); a.use(express.json())
  if (fakeQueue) a.locals.generationQueue = fakeQueue
  a.use('/api/generate', generateRoutes); return a
}
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())

async function betaUser({ plan = 'free' } = {}) {
  const { user, token, workspace } = await makeAuthedUser({ plan })
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)
  return { user, token, workspace: ws }
}
async function proUser() { return betaUser({ plan: 'pro' }) }

// Fake queue that always succeeds and captures enqueued items.
const fakeQueue = { add: async () => ({ id: 'bull-test' }) }

// ── 1. estCostFor helper ───────────────────────────────────────────────────

test('estCostFor returns registry estCostUsd for each type/tier', () => {
  assert.equal(estCostFor('text', 'standard'), 0)
  assert.equal(estCostFor('text', 'premium'), 0.03)
  assert.equal(estCostFor('image', 'standard'), 0.003)
  assert.equal(estCostFor('image', 'premium'), 0.05)
  assert.equal(estCostFor('voice', 'standard'), 0.0005)
  assert.equal(estCostFor('voice', 'premium'), 0.01)
  assert.equal(estCostFor('video', 'standard'), 0.60)
  assert.equal(estCostFor('video', 'premium'), 1.20)
  assert.equal(estCostFor('compile', 'standard'), 0.02)
})

test('estCostFor returns 0 for unknown type/tier (safe fallback)', () => {
  assert.equal(estCostFor('hologram', 'standard'), 0)
  assert.equal(estCostFor('text', 'ultra'), 0)
})

// ── 2. Video credits re-priced ─────────────────────────────────────────────

test('creditCost video standard is now 40 (re-priced)', () => {
  assert.equal(creditCost('video', 'standard'), 40)
})

test('creditCost video premium is now 80 (re-priced)', () => {
  assert.equal(creditCost('video', 'premium'), 80)
})

// ── 3. Job.costUsd set from registry at creation ───────────────────────────

test('text/standard job creation sets costUsd = estCostFor(text,standard)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 50, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app(fakeQueue)).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'once upon a time', rightsConfirmed: true, tier: 'standard' })
  assert.equal(res.status, 202)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.costUsd, estCostFor('text', 'standard'), 'costUsd should equal estCostFor(text,standard)')
})

test('image/standard job creation sets costUsd = estCostFor(image,standard)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 50, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app(fakeQueue)).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'cinematic forest scene', tier: 'standard' })
  assert.equal(res.status, 202)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.costUsd, estCostFor('image', 'standard'), 'costUsd should equal estCostFor(image,standard)')
})

test('video/standard job creation sets costUsd = estCostFor(video,standard)', async () => {
  const { token, workspace } = await proUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 200, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app(fakeQueue)).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'a dragon flying', tier: 'standard' })
  assert.equal(res.status, 202)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.costUsd, 0.60, 'video/standard costUsd should be 0.60')
})

// ── 4. Generate 202 returns creditsCharged + creditsRemaining ─────────────

test('POST /text 202 body includes creditsCharged and creditsRemaining', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 10, purchasedCredits: 5, creditPeriod: period })
  const res = await authed(request(app(fakeQueue)).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'the tale', rightsConfirmed: true, tier: 'standard' })
  assert.equal(res.status, 202)
  assert.ok(res.body.jobId, 'jobId present')
  // text/standard costs 1 credit; started with 15 total
  assert.equal(res.body.creditsCharged, 1, 'creditsCharged === 1 for text/standard')
  assert.equal(res.body.creditsRemaining, 14, 'creditsRemaining === 14 (15 - 1)')
})

test('POST /image 202 body includes creditsCharged and creditsRemaining', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 20, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app(fakeQueue)).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'sunset over ocean', tier: 'standard' })
  assert.equal(res.status, 202)
  // image/standard costs 4 credits; started with 20
  assert.equal(res.body.creditsCharged, 4)
  assert.equal(res.body.creditsRemaining, 16)
})

// ── 5. Platform daily $ spend kill-switch ─────────────────────────────────

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
}
function reqFor(managedBeta, wsId, tier = 'standard') {
  return {
    workspace: { _id: wsId, managedBeta, plan: 'pro' },
    user: { _id: new mongoose.Types.ObjectId(), emailVerifiedAt: new Date(), role: 'user' },
    body: { tier },
    params: {},
  }
}

test('spend kill-switch: under cap → allowed (next() called)', async () => {
  const wsId = new mongoose.Types.ObjectId()
  // Seed one job with costUsd 0.10 — well under a cap of 5.00
  await Job.create({ workspaceId: wsId, createdBy: new mongoose.Types.ObjectId(), type: 'image', tier: 'standard', status: 'done', costUsd: 0.10 })
  const req = reqFor(true, wsId)
  const res = mockRes()
  let nextCalled = false
  await managedAccess('image', { dailySpendCapUsdOverride: 5.00 })(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true, 'next() should be called when under cap')
  assert.equal(res.statusCode, 200, 'status should remain 200')
})

test('spend kill-switch: sum + newCost > cap → 503 spend_cap', async () => {
  const wsId = new mongoose.Types.ObjectId()
  // Seed jobs totalling $4.80; new video/standard est = $0.60 → total $5.40 > cap $5.00
  await Job.create({ workspaceId: wsId, createdBy: new mongoose.Types.ObjectId(), type: 'video', tier: 'standard', status: 'done', costUsd: 2.40 })
  await Job.create({ workspaceId: wsId, createdBy: new mongoose.Types.ObjectId(), type: 'video', tier: 'standard', status: 'done', costUsd: 2.40 })
  const req = reqFor(true, wsId, 'standard')
  const res = mockRes()
  let nextCalled = false
  await managedAccess('video', { dailySpendCapUsdOverride: 5.00 })(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, false, 'next() should NOT be called when over cap')
  assert.equal(res.statusCode, 503, 'should return 503')
  assert.equal(res.body?.code, 'spend_cap', 'code should be spend_cap')
})

test('spend kill-switch: 0 (disabled) → always allowed', async () => {
  const wsId = new mongoose.Types.ObjectId()
  // Seed a very large spend — cap is 0 so it should be ignored
  await Job.create({ workspaceId: wsId, createdBy: new mongoose.Types.ObjectId(), type: 'video', tier: 'premium', status: 'done', costUsd: 9999.99 })
  const req = reqFor(true, wsId)
  const res = mockRes()
  let nextCalled = false
  await managedAccess('text', { dailySpendCapUsdOverride: 0 })(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true, 'next() should be called when cap is 0 (disabled)')
})

test('spend kill-switch: failed jobs are excluded from the sum', async () => {
  const wsId = new mongoose.Types.ObjectId()
  // Seed $10 in failed jobs — should NOT count toward cap
  await Job.create({ workspaceId: wsId, createdBy: new mongoose.Types.ObjectId(), type: 'video', tier: 'standard', status: 'failed', costUsd: 10.00 })
  const req = reqFor(true, wsId)
  const res = mockRes()
  let nextCalled = false
  // cap = 1.00; new cost 0.003 (image/standard); failed $10 excluded → sum=0 → allowed
  await managedAccess('image', { dailySpendCapUsdOverride: 1.00 })(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true, 'failed jobs should be excluded from spend sum')
})

// ── 6. GET /estimate returns credits + estCostUsd ─────────────────────────

test('GET /estimate returns credits and estCostUsd for text/standard', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app(fakeQueue)).get('/api/generate/estimate?type=text&tier=standard'), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.type, 'text')
  assert.equal(res.body.tier, 'standard')
  assert.equal(res.body.credits, 1)
  assert.equal(res.body.estCostUsd, 0)
})

test('GET /estimate returns credits and estCostUsd for video/premium', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app(fakeQueue)).get('/api/generate/estimate?type=video&tier=premium'), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.type, 'video')
  assert.equal(res.body.tier, 'premium')
  assert.equal(res.body.credits, 80)
  assert.equal(res.body.estCostUsd, 1.20)
})

test('GET /estimate returns credits and estCostUsd for image/standard', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app(fakeQueue)).get('/api/generate/estimate?type=image&tier=standard'), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.credits, 4)
  assert.equal(res.body.estCostUsd, 0.003)
})

test('GET /estimate 400 on missing type', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app(fakeQueue)).get('/api/generate/estimate'), token, workspace._id)
  assert.equal(res.status, 400)
})

test('GET /estimate 400 on invalid type', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app(fakeQueue)).get('/api/generate/estimate?type=hologram&tier=standard'), token, workspace._id)
  assert.equal(res.status, 400)
})

test('GET /estimate defaults tier to standard when omitted', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app(fakeQueue)).get('/api/generate/estimate?type=voice'), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.tier, 'standard')
  assert.equal(res.body.credits, 1)
  assert.equal(res.body.estCostUsd, 0.0005)
})
