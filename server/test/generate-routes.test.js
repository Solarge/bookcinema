import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import generateRoutes from '../routes/generate.js'
import Job from '../models/Job.js'
import Workspace from '../models/Workspace.js'
import CharacterAsset from '../models/CharacterAsset.js'
import mongoose from 'mongoose'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

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

test('POST /text creates a queued job and enqueues it (202)', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push({ n, d }); return { id: 'bull1' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'a fable', genrePreset: 'cinematic', language: 'en', tier: 'standard', rightsConfirmed: true })
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
  const { token, workspace } = await betaUser({ plan: 'pro' })
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
  const { token, workspace } = await betaUser({ plan: 'pro' })
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

test('POST /music creates a queued music job and enqueues it (202) for a pro workspace', async () => {
  const { token, workspace } = await betaUser({ plan: 'pro' })
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullm1' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/music'), token, workspace._id)
    .send({ prompt: 'epic orchestral battle score', duration: 30, tier: 'standard' })
  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.type, 'music')
  assert.equal(job.status, 'queued')
  assert.equal(job.params.duration, 30)
  assert.equal(enq[0].type, 'music')
  assert.equal(enq[0].payload.prompt, 'epic orchestral battle score')
})

test('POST /music 400 on missing prompt', async () => {
  const { token, workspace } = await betaUser({ plan: 'pro' })
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/music'), token, workspace._id)
    .send({ tier: 'standard' })
  assert.equal(res.status, 400)
})

test('POST /music 403 plan_feature on free plan', async () => {
  const { token, workspace } = await betaUser({ plan: 'free' })
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/music'), token, workspace._id)
    .send({ prompt: 'a calm piano piece', tier: 'standard' })
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'plan_feature')
  assert.equal(res.body.feature, 'music')
  assert.equal(res.body.requiredPlan, 'pro')
})

test('POST /music debits music credits (standard = 10)', async () => {
  const { token, workspace } = await betaUser({ plan: 'pro' })
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 25, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/music'), token, workspace._id)
    .send({ prompt: 'a tense cinematic bed', tier: 'standard' })
  assert.equal(res.status, 202)
  assert.equal((await Workspace.findById(workspace._id)).creditBalance, 15)
})

test('POST /music clamps duration to 3–60 seconds', async () => {
  const { token, workspace } = await betaUser({ plan: 'pro' })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/music'), token, workspace._id)
    .send({ prompt: 'a long ambient drone', duration: 999, tier: 'standard' })
  assert.equal(res.status, 202)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.params.duration, 60)
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
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 0, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'x', tier: 'standard', rightsConfirmed: true })
  assert.equal(res.status, 402)
})

test('POST /text debits credits on enqueue (text standard = 1)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 5, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'x', tier: 'standard', rightsConfirmed: true })
  assert.equal(res.status, 202)
  assert.equal((await Workspace.findById(workspace._id)).creditBalance, 4)
})

test('POST /text passes episodeCount through to the job params', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bull2' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'a fable', genrePreset: 'cinematic', language: 'en', tier: 'standard', rightsConfirmed: true, episodeCount: 5 })
  assert.equal(res.status, 202)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.params.episodeCount, 5)
  assert.equal(enq[0].payload.episodeCount, 5)
})

test('POST /text passes a large episodeCount through (prompt builder caps it, route does not streamline)', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bull3' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'a fable', tier: 'standard', rightsConfirmed: true, episodeCount: 99 })
  assert.equal(res.status, 202)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.params.episodeCount, 99)
})

test("POST /text defaults episodeCount to 'auto' when omitted (the book decides)", async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bull4' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'a fable', tier: 'standard', rightsConfirmed: true })
  assert.equal(res.status, 202)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.params.episodeCount, 'auto')
})

test('POST /image debits cost-weighted credits (image standard = 4)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 10, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'a fox', tier: 'standard' })
  assert.equal(res.status, 202)
  assert.equal((await Workspace.findById(workspace._id)).creditBalance, 6)
})

// ── Character memory: characterRef threading on /image and /video ────────────────
const REF_URL = 'https://b.s3.us-east-1.amazonaws.com/generated/x/hero.png'

test('POST /image threads an explicit characterRef into the enqueued payload', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullci' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'a fox', tier: 'standard', characterRef: REF_URL })
  assert.equal(res.status, 202)
  assert.equal(enq[0].payload.characterRef, REF_URL)
})

test('POST /image leaves characterRef null when none is provided (backward compatible)', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullci2' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'a fox', tier: 'standard' })
  assert.equal(res.status, 202)
  assert.equal(enq[0].payload.characterRef, null)
})

test('POST /image drops an invalid (non-https/private) characterRef', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullci3' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'a fox', tier: 'standard', characterRef: 'http://127.0.0.1/secret.png' })
  assert.equal(res.status, 202)
  assert.equal(enq[0].payload.characterRef, null)
})

test('POST /image resolves characterId → characterRef from a seeded CharacterAsset', async () => {
  const { user, token, workspace } = await betaUser()
  const seriesId = new mongoose.Types.ObjectId()
  await CharacterAsset.create({ workspaceId: workspace._id, seriesId, characterId: 'hero', s3Key: 'generated/x/hero.png', s3Url: REF_URL, createdBy: user._id })
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullci4' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/image'), token, workspace._id)
    .send({ prompt: 'a fox', tier: 'standard', characterId: 'hero', seriesId: String(seriesId) })
  assert.equal(res.status, 202)
  assert.match(enq[0].payload.characterRef, /X-Amz-Signature=/)
})

test('POST /video threads an explicit characterRef into the enqueued payload', async () => {
  const { token, workspace } = await betaUser({ plan: 'pro' })
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullcv' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'a fox runs', tier: 'standard', characterRef: REF_URL })
  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  assert.equal(enq[0].payload.characterRef, REF_URL)
})

test('POST /video resolves characterId → characterRef from a seeded CharacterAsset', async () => {
  const { user, token, workspace } = await betaUser({ plan: 'pro' })
  const seriesId = new mongoose.Types.ObjectId()
  await CharacterAsset.create({ workspaceId: workspace._id, seriesId, characterId: 'hero', s3Key: 'generated/x/hero.png', s3Url: REF_URL, createdBy: user._id })
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullcv2' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/video'), token, workspace._id)
    .send({ prompt: 'a fox runs', tier: 'standard', characterId: 'hero', seriesId: String(seriesId) })
  assert.equal(res.status, 202)
  assert.match(enq[0].payload.characterRef, /X-Amz-Signature=/)
})

// ── Director's Chat: POST /refine ───────────────────────────────────────────────
const sampleSeries = { title: 'The Fable', author: 'Anon', episodes: [{ title: 'Ep 1', scenes: [] }] }

test('POST /refine creates a queued refine job and enqueues it (202)', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push(d); return { id: 'bullr1' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/refine'), token, workspace._id)
    .send({ instruction: 'make episode 1 darker', currentSeries: sampleSeries, tier: 'standard' })
  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.type, 'refine')
  assert.equal(job.status, 'queued')
  assert.equal(job.params.instruction, 'make episode 1 darker')
  assert.equal(enq[0].type, 'refine')
  assert.equal(enq[0].payload.instruction, 'make episode 1 darker')
  assert.deepEqual(enq[0].payload.currentSeries, sampleSeries)
})

test('POST /refine works on a free plan (gated on text, available to all)', async () => {
  const { token, workspace } = await betaUser({ plan: 'free' })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/refine'), token, workspace._id)
    .send({ instruction: 'why only 1 episode?', currentSeries: sampleSeries, tier: 'standard' })
  assert.equal(res.status, 202)
})

test('POST /refine 400 on missing instruction', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/refine'), token, workspace._id)
    .send({ currentSeries: sampleSeries, tier: 'standard' })
  assert.equal(res.status, 400)
})

test('POST /refine 400 when instruction is too long', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/refine'), token, workspace._id)
    .send({ instruction: 'x'.repeat(2001), currentSeries: sampleSeries, tier: 'standard' })
  assert.equal(res.status, 400)
})

test('POST /refine 400 when currentSeries missing', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/refine'), token, workspace._id)
    .send({ instruction: 'add a villain', tier: 'standard' })
  assert.equal(res.status, 400)
})

test('POST /refine 400 when currentSeries is not a valid series object', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/refine'), token, workspace._id)
    .send({ instruction: 'add a villain', currentSeries: { foo: 'bar' }, tier: 'standard' })
  assert.equal(res.status, 400)
})

test('POST /refine 400 when currentSeries is an array', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/refine'), token, workspace._id)
    .send({ instruction: 'add a villain', currentSeries: [], tier: 'standard' })
  assert.equal(res.status, 400)
})

test('POST /refine 403 when workspace not allowlisted', async () => {
  const { token, workspace } = await makeAuthedUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/refine'), token, workspace._id)
    .send({ instruction: 'add a villain', currentSeries: sampleSeries, tier: 'standard' })
  assert.equal(res.status, 403)
})

test('POST /refine debits refine credits (standard = 2)', async () => {
  const { token, workspace } = await betaUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 5, purchasedCredits: 0, creditPeriod: period })
  const res = await authed(request(app({ add: async () => ({ id: 'b' }) })).post('/api/generate/refine'), token, workspace._id)
    .send({ instruction: 'make it darker', currentSeries: sampleSeries, tier: 'standard' })
  assert.equal(res.status, 202)
  assert.equal((await Workspace.findById(workspace._id)).creditBalance, 3)
})
