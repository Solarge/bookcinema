/**
 * Tests for the compile-episode feature:
 *  - Route: POST /api/generate/compile
 *  - Worker: processCompile (with injected fake concatVideos + uploadFn)
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
import { processCompile } from '../worker/processCompile.js'

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

const VALID_CLIPS = [
  'https://cdn.example.com/clip1.mp4',
  'https://cdn.example.com/clip2.mp4',
]

// ── Route tests ───────────────────────────────────────────────────────────────

test('POST /compile 202 — pro+beta+verified with 2 valid clips creates Job + debits credits', async () => {
  const { token, workspace } = await proUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 50, purchasedCredits: 0, creditPeriod: period })
  const ws = await Workspace.findById(workspace._id)

  const enqueued = []
  const fakeQueue = { add: async (n, d) => { enqueued.push(d); return { id: 'bull-compile-1' } } }

  const res = await authed(request(app(fakeQueue)).post('/api/generate/compile'), token, ws._id)
    .send({ seriesId: new mongoose.Types.ObjectId().toString(), episodeNumber: 1, clips: VALID_CLIPS })

  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  assert.ok(res.body.jobId, 'jobId should be returned')

  // Job was created with type 'compile'
  const job = await Job.findById(res.body.jobId)
  assert.ok(job, 'job should exist in DB')
  assert.equal(job.type, 'compile')
  assert.equal(job.status, 'queued')

  // Credits were debited (compile costs 5)
  const updated = await Workspace.findById(ws._id)
  assert.equal(updated.creditBalance, 45, 'should have debited 5 credits for compile')

  // Queue received the job
  assert.equal(enqueued.length, 1)
  assert.equal(enqueued[0].type, 'compile')
  assert.deepEqual(enqueued[0].payload.clips, VALID_CLIPS)
})

test('POST /compile 202 — accepts an optional soundtrackUrl and passes it in the payload', async () => {
  const { token, workspace } = await proUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 50, purchasedCredits: 0, creditPeriod: period })
  const ws = await Workspace.findById(workspace._id)

  const enqueued = []
  const fakeQueue = { add: async (n, d) => { enqueued.push(d); return { id: 'bull-compile-st' } } }

  const res = await authed(request(app(fakeQueue)).post('/api/generate/compile'), token, ws._id)
    .send({ clips: VALID_CLIPS, soundtrackUrl: 'https://cdn.example.com/score.mp3' })

  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  assert.equal(enqueued.length, 1)
  assert.equal(enqueued[0].payload.soundtrackUrl, 'https://cdn.example.com/score.mp3')
})

test('POST /compile 202 — accepts an optional title and passes it in the payload', async () => {
  const { token, workspace } = await proUser()
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
  await Workspace.findByIdAndUpdate(workspace._id, { monthlyCredits: 50, purchasedCredits: 0, creditPeriod: period })
  const ws = await Workspace.findById(workspace._id)

  const enqueued = []
  const fakeQueue = { add: async (n, d) => { enqueued.push(d); return { id: 'bull-compile-title' } } }

  const res = await authed(request(app(fakeQueue)).post('/api/generate/compile'), token, ws._id)
    .send({ clips: VALID_CLIPS, title: 'Episode 1 — The Golden Cage' })

  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`)
  assert.equal(enqueued.length, 1)
  assert.equal(enqueued[0].payload.title, 'Episode 1 — The Golden Cage')
})

test('POST /compile 400 — invalid soundtrackUrl fails the SSRF guard', async () => {
  const { token, workspace } = await proUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/compile'), token, workspace._id)
    .send({ clips: VALID_CLIPS, soundtrackUrl: 'http://192.168.1.1/score.mp3' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /soundtrack URL/i)
})

test('POST /compile 403 plan_feature — free plan cannot compile', async () => {
  const { user, token, workspace } = await makeAuthedUser({ plan: 'free' })
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  const ws = await Workspace.findById(workspace._id)

  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/compile'), token, ws._id)
    .send({ clips: VALID_CLIPS })

  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'plan_feature')
  assert.equal(res.body.feature, 'video')
  assert.equal(res.body.requiredPlan, 'pro')
})

test('POST /compile 400 — fewer than 2 clips rejected', async () => {
  const { token, workspace } = await proUser()

  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/compile'), token, workspace._id)
    .send({ clips: ['https://cdn.example.com/clip1.mp4'] })

  assert.equal(res.status, 400)
  assert.match(res.body.error, /at least 2/)
})

test('POST /compile 400 — empty clips array rejected', async () => {
  const { token, workspace } = await proUser()

  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/compile'), token, workspace._id)
    .send({ clips: [] })

  assert.equal(res.status, 400)
  assert.match(res.body.error, /at least 2/)
})

test('POST /compile 400 — clip with http:// (non-https) fails SSRF guard', async () => {
  const { token, workspace } = await proUser()

  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/compile'), token, workspace._id)
    .send({ clips: ['http://localhost/clip.mp4', 'https://cdn.example.com/clip2.mp4'] })

  assert.equal(res.status, 400)
  assert.match(res.body.error, /clip URL at index 0/)
})

test('POST /compile 400 — private IP clip (http://192.168.1.1) fails SSRF guard', async () => {
  const { token, workspace } = await proUser()

  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/compile'), token, workspace._id)
    .send({ clips: ['https://192.168.1.1/clip.mp4', 'https://cdn.example.com/clip2.mp4'] })

  assert.equal(res.status, 400)
  assert.match(res.body.error, /clip URL at index 0/)
})

test('POST /compile 403 — managedBeta=false workspace blocked', async () => {
  const { token, workspace } = await makeAuthedUser({ plan: 'pro' })
  // managedBeta defaults to false

  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/compile'), token, workspace._id)
    .send({ clips: VALID_CLIPS })

  assert.equal(res.status, 403)
})

// ── processCompile worker unit tests ─────────────────────────────────────────

test('processCompile: fake concatVideos → uploads buffer to S3 → job status done', async () => {
  const wsId = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()

  const job = await Job.create({
    workspaceId: wsId,
    createdBy: uid,
    type: 'compile',
    tier: 'standard',
    status: 'queued',
    params: { seriesId: null, episodeNumber: 1 },
  })

  const fakeBuffer = Buffer.from('fake-compiled-video-bytes')
  const fakeConcatVideos = async (clips) => {
    assert.equal(clips.length, 2)
    return fakeBuffer
  }

  let uploadedKey = null
  const fakeUpload = async (key, buf, mime) => {
    uploadedKey = key
    assert.equal(buf, fakeBuffer)
    assert.equal(mime, 'video/mp4')
    return `https://s3.example/${key}`
  }

  const result = await processCompile(
    {
      jobId: String(job._id),
      workspaceId: String(wsId),
      createdBy: String(uid),
      payload: { clips: VALID_CLIPS, seriesId: null, episodeNumber: 1 },
    },
    { concatVideos: fakeConcatVideos, uploadFn: fakeUpload },
  )

  assert.ok(result.ok)
  assert.ok(result.resultUrl)

  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultUrl, /^https:\/\/s3\.example\/generated\//)
  assert.match(uploadedKey, new RegExp(`generated/${wsId}/${job._id}-compiled\\.mp4`))
})

test('processCompile: payload.title slugifies into the uploaded S3 key', async () => {
  const wsId = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()

  const job = await Job.create({
    workspaceId: wsId, createdBy: uid, type: 'compile', tier: 'standard', status: 'queued',
    params: { seriesId: null, episodeNumber: 1 },
  })

  const fakeConcatVideos = async () => Buffer.from('compiled')
  let uploadedKey = null
  const fakeUpload = async (key) => { uploadedKey = key; return `https://s3.example/${key}` }

  await processCompile(
    {
      jobId: String(job._id), workspaceId: String(wsId), createdBy: String(uid),
      payload: { clips: VALID_CLIPS, title: 'Episode 1 — The Golden Cage', seriesId: null, episodeNumber: 1 },
    },
    { concatVideos: fakeConcatVideos, uploadFn: fakeUpload },
  )

  assert.ok(uploadedKey, 'upload should have been called')
  assert.match(uploadedKey, /episode-1-the-golden-cage-/)
  assert.match(uploadedKey, new RegExp(`${job._id}-compiled\\.mp4$`))
})

test('processCompile: passes payload.soundtrackUrl through to concatVideos', async () => {
  const wsId = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()

  const job = await Job.create({
    workspaceId: wsId, createdBy: uid, type: 'compile', tier: 'standard', status: 'queued',
    params: { seriesId: null, episodeNumber: 1 },
  })

  let receivedSoundtrack = 'NOT_CALLED'
  const fakeConcatVideos = async (clips, soundtrackUrl) => {
    receivedSoundtrack = soundtrackUrl
    return Buffer.from('compiled-with-score')
  }
  const fakeUpload = async (key) => `https://s3.example/${key}`

  await processCompile(
    {
      jobId: String(job._id), workspaceId: String(wsId), createdBy: String(uid),
      payload: { clips: VALID_CLIPS, soundtrackUrl: 'https://cdn.example.com/score.mp3', seriesId: null, episodeNumber: 1 },
    },
    { concatVideos: fakeConcatVideos, uploadFn: fakeUpload },
  )

  assert.equal(receivedSoundtrack, 'https://cdn.example.com/score.mp3')
  assert.equal((await Job.findById(job._id)).status, 'done')
})

test('processCompile: concatVideos throws → job status failed', async () => {
  const wsId = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()

  const job = await Job.create({
    workspaceId: wsId,
    createdBy: uid,
    type: 'compile',
    tier: 'standard',
    status: 'queued',
    params: {},
  })

  const failingConcat = async () => { throw new Error('ffmpeg crashed') }
  const fakeUpload = async () => 'https://s3.example/unused'

  await assert.rejects(() =>
    processCompile(
      {
        jobId: String(job._id),
        workspaceId: String(wsId),
        createdBy: String(uid),
        payload: { clips: VALID_CLIPS },
      },
      { concatVideos: failingConcat, uploadFn: fakeUpload },
    ),
    /ffmpeg crashed/,
  )

  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'failed')
  assert.match(updated.errorMessage, /ffmpeg crashed/)
})
