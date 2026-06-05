/**
 * Tests for the scene-audio-mux feature:
 *  - Route: POST /api/generate/mux
 *  - Worker: processMux (with injected fake muxFn + uploadFn)
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
import { processMux } from '../worker/processMux.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

// ── App factory ───────────────────────────────────────────────────────────────
function app(fakeQueue) {
  const a = express(); a.use(express.json())
  if (fakeQueue) a.locals.generationQueue = fakeQueue
  a.use('/api/generate', generateRoutes)
  return a
}
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())

/** Create a pro plan + managedBeta + verified user */
async function proUser() {
  const { user, token, workspace } = await makeAuthedUser({ plan: 'pro' })
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)
  return { user, token, workspace: ws }
}

async function withCredits(workspaceId, credits = 50) {
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspaceId, { monthlyCredits: credits, purchasedCredits: 0, creditPeriod: period })
  return Workspace.findById(workspaceId)
}

const VIDEO_URL = 'https://cdn.example.com/clip.mp4'
const VOICE_URL = 'https://cdn.example.com/voice1.mp3'
const MUSIC_URL = 'https://cdn.example.com/bed.mp3'

// ── Route tests ───────────────────────────────────────────────────────────────

test('POST /mux 202 — pro+beta+credits with valid body creates a mux Job + debits credits', async () => {
  const { token, workspace } = await proUser()
  const ws = await withCredits(workspace._id, 50)

  const enqueued = []
  const fakeQueue = { add: async (n, d) => { enqueued.push(d); return { id: 'bull-mux-1' } } }

  const res = await authed(request(app(fakeQueue)).post('/api/generate/mux'), token, ws._id)
    .send({ videoUrl: VIDEO_URL, voiceUrls: [VOICE_URL], musicUrl: MUSIC_URL, musicVolume: 0.4 })

  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  assert.ok(res.body.jobId, 'jobId should be returned')

  const job = await Job.findById(res.body.jobId)
  assert.ok(job, 'job should exist in DB')
  assert.equal(job.type, 'mux')
  assert.equal(job.status, 'queued')

  // Same flat credit treatment as compile (5 credits).
  const updated = await Workspace.findById(ws._id)
  assert.equal(updated.creditBalance, 45, 'should have debited 5 credits for mux')

  // Queue received the job with the contract payload.
  assert.equal(enqueued.length, 1)
  assert.equal(enqueued[0].type, 'mux')
  assert.equal(enqueued[0].payload.videoUrl, VIDEO_URL)
  assert.deepEqual(enqueued[0].payload.voiceUrls, [VOICE_URL])
  assert.equal(enqueued[0].payload.musicUrl, MUSIC_URL)
  assert.equal(enqueued[0].payload.musicVolume, 0.4)
})

test('POST /mux 202 — music-only (no voiceUrls) is accepted and defaults musicVolume to 0.3', async () => {
  const { token, workspace } = await proUser()
  const ws = await withCredits(workspace._id, 50)

  const enqueued = []
  const fakeQueue = { add: async (n, d) => { enqueued.push(d); return { id: 'bull-mux-2' } } }

  const res = await authed(request(app(fakeQueue)).post('/api/generate/mux'), token, ws._id)
    .send({ videoUrl: VIDEO_URL, musicUrl: MUSIC_URL })

  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  assert.equal(enqueued.length, 1)
  assert.deepEqual(enqueued[0].payload.voiceUrls, [])
  assert.equal(enqueued[0].payload.musicUrl, MUSIC_URL)
  assert.equal(enqueued[0].payload.musicVolume, 0.3)
})

test('POST /mux 400 — videoUrl missing', async () => {
  const { token, workspace } = await proUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/mux'), token, workspace._id)
    .send({ voiceUrls: [VOICE_URL] })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /video URL/i)
})

test('POST /mux 400 — neither voiceUrls nor musicUrl provided', async () => {
  const { token, workspace } = await proUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/mux'), token, workspace._id)
    .send({ videoUrl: VIDEO_URL })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /at least one of/i)
})

test('POST /mux 400 — empty voiceUrls array and no musicUrl is rejected', async () => {
  const { token, workspace } = await proUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/mux'), token, workspace._id)
    .send({ videoUrl: VIDEO_URL, voiceUrls: [] })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /at least one of/i)
})

test('POST /mux 400 — SSRF/bad videoUrl (private IP) fails the guard', async () => {
  const { token, workspace } = await proUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/mux'), token, workspace._id)
    .send({ videoUrl: 'https://192.168.1.1/clip.mp4', voiceUrls: [VOICE_URL] })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /video URL/i)
})

test('POST /mux 400 — SSRF/bad voiceUrl fails the guard', async () => {
  const { token, workspace } = await proUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/mux'), token, workspace._id)
    .send({ videoUrl: VIDEO_URL, voiceUrls: ['http://localhost/voice.mp3'] })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /voice URL at index 0/i)
})

test('POST /mux 400 — SSRF/bad musicUrl fails the guard', async () => {
  const { token, workspace } = await proUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/mux'), token, workspace._id)
    .send({ videoUrl: VIDEO_URL, musicUrl: 'https://10.0.0.5/bed.mp3' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /music URL/i)
})

test('POST /mux 403 plan_feature — free plan cannot mux', async () => {
  const { token, workspace } = await makeAuthedUser({ plan: 'free' })
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)

  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/mux'), token, ws._id)
    .send({ videoUrl: VIDEO_URL, voiceUrls: [VOICE_URL] })

  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'plan_feature')
  assert.equal(res.body.feature, 'video')
  assert.equal(res.body.requiredPlan, 'pro')
})

// ── processMux worker unit tests ──────────────────────────────────────────────

test('processMux: fake muxFn receives payload args → uploads → job done w/ resultUrl + resultKey', async () => {
  const wsId = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()

  const job = await Job.create({
    workspaceId: wsId, createdBy: uid, type: 'mux', tier: 'standard', status: 'queued', params: {},
  })

  const fakeBuffer = Buffer.from('fake-muxed-video-bytes')
  let received = null
  const fakeMux = async (videoUrl, voiceUrls, musicUrl, musicVolume) => {
    received = { videoUrl, voiceUrls, musicUrl, musicVolume }
    return fakeBuffer
  }

  let uploadedKey = null
  const fakeUpload = async (key, buf, mime) => {
    uploadedKey = key
    assert.equal(buf, fakeBuffer)
    assert.equal(mime, 'video/mp4')
    return `https://s3.example/${key}`
  }

  const result = await processMux(
    {
      jobId: String(job._id), workspaceId: String(wsId), createdBy: String(uid),
      payload: { videoUrl: VIDEO_URL, voiceUrls: [VOICE_URL], musicUrl: MUSIC_URL, musicVolume: 0.25 },
    },
    { muxFn: fakeMux, uploadFn: fakeUpload },
  )

  // muxFn got exactly (videoUrl, voiceUrls, musicUrl, musicVolume) from the payload.
  assert.deepEqual(received, { videoUrl: VIDEO_URL, voiceUrls: [VOICE_URL], musicUrl: MUSIC_URL, musicVolume: 0.25 })

  assert.ok(result.ok)
  assert.ok(result.resultUrl)
  assert.match(uploadedKey, new RegExp(`generated/${wsId}/${job._id}-muxed\\.mp4`))

  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultUrl, /^https:\/\/s3\.example\/generated\//)
  assert.equal(updated.resultKey, `generated/${wsId}/${job._id}-muxed.mp4`)
})

test('processMux: muxFn throws → job status failed', async () => {
  const wsId = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()

  const job = await Job.create({
    workspaceId: wsId, createdBy: uid, type: 'mux', tier: 'standard', status: 'queued', params: {},
  })

  const failingMux = async () => { throw new Error('ffmpeg mux crashed') }
  const fakeUpload = async () => 'https://s3.example/unused'

  await assert.rejects(() =>
    processMux(
      {
        jobId: String(job._id), workspaceId: String(wsId), createdBy: String(uid),
        payload: { videoUrl: VIDEO_URL, voiceUrls: [VOICE_URL], musicUrl: null, musicVolume: 0.3 },
      },
      { muxFn: failingMux, uploadFn: fakeUpload },
    ),
    /ffmpeg mux crashed/,
  )

  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'failed')
  assert.match(updated.errorMessage, /ffmpeg mux crashed/)
})
