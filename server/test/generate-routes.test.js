import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import generateRoutes from '../routes/generate.js'
import Job from '../models/Job.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

function app(fakeQueue) {
  const a = express(); a.use(express.json())
  if (fakeQueue) a.locals.generationQueue = fakeQueue
  a.use('/api/generate', generateRoutes); return a
}
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())
async function betaUser() {
  const { user, token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  return { user, token, workspace }
}

test('POST /text creates a queued job and enqueues it (202)', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push({ n, d }); return { id: 'bull1' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'a fable', genrePreset: 'cinematic', language: 'en', tier: 'standard' })
  assert.equal(res.status, 202)
  assert.ok(res.body.jobId)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.status, 'queued')
  assert.equal(job.type, 'text')
  assert.equal(enq.length, 1)
})

test('POST /text 403 when workspace not allowlisted', async () => {
  const { token, workspace } = await makeAuthedUser() // managedBeta false
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'x', tier: 'standard' })
  assert.equal(res.status, 403)
})

test('POST /text 400 on missing bookText', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/text'), token, workspace._id)
    .send({ tier: 'standard' })
  assert.equal(res.status, 400)
})

test('POST /voice creates a queued voice job and enqueues it (202)', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullv1' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/voice'), token, workspace._id)
    .send({ text: 'Hello world', voiceId: 'nova', tier: 'standard' })
  assert.equal(res.status, 202)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.type, 'voice')
  assert.equal(job.status, 'queued')
  assert.equal(enq[0].type, 'voice')
  assert.equal(enq[0].payload.text, 'Hello world')
})

test('POST /voice 400 on missing text', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/voice'), token, workspace._id)
    .send({ tier: 'standard' })
  assert.equal(res.status, 400)
})

test('POST /voice 403 when workspace not allowlisted', async () => {
  const { token, workspace } = await makeAuthedUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/voice'), token, workspace._id)
    .send({ text: 'hi', tier: 'standard' })
  assert.equal(res.status, 403)
})

test('POST /image creates a queued image job and enqueues it (202)', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bulli1' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'a cinematic fox portrait', aspectRatio: '9:16', tier: 'standard' })
  assert.equal(res.status, 202)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.type, 'image')
  assert.equal(enq[0].type, 'image')
  assert.equal(enq[0].payload.prompt, 'a cinematic fox portrait')
})

test('POST /image 400 on missing prompt', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/image'), token, workspace._id)
    .send({ tier: 'standard' })
  assert.equal(res.status, 400)
})

test('POST /image 403 when workspace not allowlisted', async () => {
  const { token, workspace } = await makeAuthedUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'x', tier: 'standard' })
  assert.equal(res.status, 403)
})

test('POST /text 402 when the workspace is out of credits', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { creditBalance: 0, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'x', tier: 'standard' })
  assert.equal(res.status, 402)
})

test('POST /text debits credits on enqueue (text standard = 1)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { creditBalance: 5, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'x', tier: 'standard' })
  assert.equal(res.status, 202)
  assert.equal((await Workspace.findById(workspace._id)).creditBalance, 4)
})

test('POST /image debits cost-weighted credits (image standard = 4)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { creditBalance: 10, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'a fox', tier: 'standard' })
  assert.equal(res.status, 202)
  assert.equal((await Workspace.findById(workspace._id)).creditBalance, 6)
})
