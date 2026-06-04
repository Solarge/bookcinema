import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { processGeneration } from '../worker/processGeneration.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

test('processGeneration runs the adapter, stores result, logs usage, marks done', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'text', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ provider: 'groq', adapter: { generate: async () => ({ title: 'Done', characters: [], episodes: [] }) } })
  await processGeneration({ jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve })
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultText, /"title":"Done"/)
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, action: 'generate_text', success: true }), 1)
})

test('processGeneration marks the job failed + logs on adapter error', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'text', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ provider: 'groq', adapter: { generate: async () => { throw new Error('boom') } } })
  await assert.rejects(() => processGeneration({ jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve }))
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'failed')
  assert.match(updated.errorMessage, /boom/)
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, success: false }), 1)
})

test('processGeneration marks job failed when resolve throws (no stuck queued)', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'text', tier: 'standard', status: 'queued' })
  const throwingResolve = () => { throw new Error('unknown tier') }
  await assert.rejects(() => processGeneration({ jobId: String(job._id), type: 'text', tier: 'ultra', payload: {}, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: throwingResolve }))
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'failed')
})

test('processGeneration uploads media result to S3 and stores resultUrl (done)', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'voice', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ provider: 'openai', adapter: { generate: async () => ({ buffer: Buffer.from('audiobytes'), mimeType: 'audio/mpeg', ext: 'mp3' }) } })
  let uploadedKey = null
  const fakeUpload = async (key) => { uploadedKey = key; return 'https://s3.example/' + key }
  await processGeneration({ jobId: String(job._id), type: 'voice', tier: 'standard', payload: { text: 'hi' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve, uploadFn: fakeUpload })
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultUrl, /^https:\/\/s3\.example\/generated\//)
  assert.equal(updated.resultText, null)
  assert.match(uploadedKey, new RegExp(`generated/${wsId}/${job._id}\\.mp3`))
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, action: 'generate_voice', success: true }), 1)
})

test('processGeneration does NOT refund on failure (refund is terminal-only in the worker)', async () => {
  const { default: Workspace } = await import('../models/Workspace.js')
  const owner = new mongoose.Types.ObjectId()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: owner, members: [{ userId: owner, role: 'owner' }], monthlyCredits: 0, purchasedCredits: 0 })
  const job = await Job.create({ workspaceId: w._id, createdBy: owner, type: 'text', tier: 'premium', status: 'queued' })
  const failing = () => ({ provider: 'anthropic', adapter: { generate: async () => { throw new Error('boom') } } })
  await assert.rejects(() => processGeneration({ jobId: String(job._id), type: 'text', tier: 'premium', payload: {}, workspaceId: String(w._id), createdBy: String(owner) }, { resolveFn: failing }))
  assert.equal((await Workspace.findById(w._id)).creditBalance, 0) // unchanged — no refund here
  assert.equal((await Job.findById(job._id)).status, 'failed')
})

// --- failover chain tests ---

test('processGeneration failover: first provider throws, second succeeds → result from second', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'text', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({
    credits: 1,
    providers: [
      { provider: 'groq',   adapter: { isConfigured: () => true, generate: async () => { throw new Error('rate limit') } }, model: 'llama' },
      { provider: 'gemini', adapter: { isConfigured: () => true, generate: async () => ({ title: 'FromGemini', characters: [], episodes: [] }) }, model: 'gemini-2.5-flash' },
    ],
  })
  await processGeneration({ jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve })
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultText, /"title":"FromGemini"/)
  // provider logged = 'gemini' (the one that succeeded)
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, action: 'generate_text', success: true, provider: 'gemini' }), 1)
})

test('processGeneration failover: unconfigured first provider is skipped (not counted as failure)', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'text', tier: 'standard', status: 'queued' })
  const firstCalled = { called: false }
  const fakeResolve = () => ({
    credits: 1,
    providers: [
      { provider: 'groq',   adapter: { isConfigured: () => false, generate: async () => { firstCalled.called = true; return {} } }, model: 'llama' },
      { provider: 'gemini', adapter: { isConfigured: () => true,  generate: async () => ({ title: 'Skipped', characters: [], episodes: [] }) }, model: 'gemini-2.5-flash' },
    ],
  })
  await processGeneration({ jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve })
  assert.equal(firstCalled.called, false, 'unconfigured first provider must not be called')
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultText, /"title":"Skipped"/)
})

test('processGeneration failover: all providers unconfigured → fails with clear error', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'text', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({
    credits: 1,
    providers: [
      { provider: 'groq',   adapter: { isConfigured: () => false, generate: async () => ({}) }, model: 'llama' },
      { provider: 'gemini', adapter: { isConfigured: () => false, generate: async () => ({}) }, model: 'gemini-2.5-flash' },
    ],
  })
  await assert.rejects(
    () => processGeneration({ jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve }),
    /No configured provider/
  )
  assert.equal((await Job.findById(job._id)).status, 'failed')
})

test('processGeneration failover: all providers throw → re-throws last error', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'text', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({
    credits: 1,
    providers: [
      { provider: 'groq',   adapter: { isConfigured: () => true, generate: async () => { throw new Error('groq down') } }, model: 'llama' },
      { provider: 'gemini', adapter: { isConfigured: () => true, generate: async () => { throw new Error('gemini down') } }, model: 'gemini-2.5-flash' },
    ],
  })
  await assert.rejects(
    () => processGeneration({ jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve }),
    /gemini down/
  )
  assert.equal((await Job.findById(job._id)).status, 'failed')
})
