import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import generateRoutes from '../routes/generate.js'
import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'
import { processGeneration } from '../worker/processGeneration.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

function app(fakeQueue) {
  const a = express(); a.use(express.json())
  if (fakeQueue) a.locals.generationQueue = fakeQueue
  a.use('/api/generate', generateRoutes); return a
}
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())

/** Create a managedBeta + pro-plan workspace (required for voice/video). */
async function proUser() {
  const { user, token, workspace } = await makeAuthedUser({ plan: 'pro' })
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)
  return { user, token, workspace: ws }
}

// ---------------------------------------------------------------------------
// POST /api/generate/video — enqueue path
// ---------------------------------------------------------------------------

test('POST /video creates a queued video job and enqueues it (202)', async () => {
  const { token, workspace } = await proUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullvid1' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'a dragon flying over mountains', aspectRatio: '16:9', duration: 5, tier: 'standard' })
  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  assert.ok(res.body.jobId, 'jobId returned')
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.type, 'video')
  assert.equal(job.status, 'queued')
  assert.equal(enq.length, 1, 'one item enqueued')
  assert.equal(enq[0].type, 'video')
  assert.equal(enq[0].payload.prompt, 'a dragon flying over mountains')
})

test('POST /video accepts kling_prompt as alias for prompt', async () => {
  const { token, workspace } = await proUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'b2' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/video'), token, workspace._id)
    .send({ kling_prompt: 'cinematic sunset', tier: 'standard' })
  assert.equal(res.status, 202)
  assert.equal(enq[0].payload.prompt, 'cinematic sunset')
})

test('POST /video 400 on missing prompt', async () => {
  const { token, workspace } = await proUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/video'), token, workspace._id)
    .send({ tier: 'standard' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /prompt/)
})

test('POST /video 403 when workspace not allowlisted (managedBeta=false)', async () => {
  const { token, workspace } = await makeAuthedUser({ plan: 'pro' })
  // managedBeta defaults to false
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'x', tier: 'standard' })
  assert.equal(res.status, 403)
})

test('POST /video 403 plan_feature on free plan', async () => {
  const { token, workspace } = await makeAuthedUser({ plan: 'free' })
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/video'), token, ws._id)
    .send({ prompt: 'x', tier: 'standard' })
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'plan_feature')
  assert.equal(res.body.feature, 'video')
  assert.equal(res.body.requiredPlan, 'pro')
})

test('POST /video 402 when pro workspace is out of credits', async () => {
  const { token, workspace } = await proUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 0, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'x', tier: 'standard' })
  assert.equal(res.status, 402)
})

test('POST /video debits cost-weighted credits (video standard = 40)', async () => {
  const { token, workspace } = await proUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 100, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'a fox running', tier: 'standard' })
  assert.equal(res.status, 202)
  assert.equal((await Workspace.findById(workspace._id)).creditBalance, 60)
})

// ---------------------------------------------------------------------------
// processGeneration video branch — uploads bytes to S3
// ---------------------------------------------------------------------------

test('processGeneration video branch uploads to S3 and stores resultUrl (done)', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'video', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({
    provider: 'replicate',
    adapter: { generate: async () => ({ buffer: Buffer.from('videobytes'), mimeType: 'video/mp4', ext: 'mp4' }) },
  })
  let uploadedKey = null
  const fakeUpload = async (key) => { uploadedKey = key; return 'https://s3.example/' + key }

  await processGeneration(
    { jobId: String(job._id), type: 'video', tier: 'standard', payload: { prompt: 'a fox', aspectRatio: '16:9', duration: 5 }, workspaceId: String(wsId), createdBy: String(uid) },
    { resolveFn: fakeResolve, uploadFn: fakeUpload },
  )
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultUrl, /^https:\/\/s3\.example\/generated\//)
  assert.equal(updated.resultText, null)
  assert.match(uploadedKey, new RegExp(`generated/${wsId}/${job._id}\\.mp4`))
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, action: 'generate_video', success: true }), 1)
})

test('processGeneration video branch marks failed on adapter error', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'video', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ provider: 'replicate', adapter: { generate: async () => { throw new Error('provider timeout') } } })
  await assert.rejects(() =>
    processGeneration({ jobId: String(job._id), type: 'video', tier: 'standard', payload: { prompt: 'x' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve }),
  )
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'failed')
  assert.match(updated.errorMessage, /provider timeout/)
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, success: false }), 1)
})
