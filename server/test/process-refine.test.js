import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { processRefine } from '../worker/processRefine.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

const ENVELOPE = JSON.stringify({ mode: 'answer', answer: 'It covers the book in one arc.' })
const REVISE_ENVELOPE = JSON.stringify({ mode: 'revise', series: { title: 'Darker', episodes: [] } })

function runData(job, wsId, uid, payload = {}) {
  return {
    jobId: String(job._id), type: 'refine', tier: 'standard',
    payload: { currentSeries: { title: 'X', episodes: [] }, instruction: 'why?', language: 'en', ...payload },
    workspaceId: String(wsId), createdBy: String(uid),
  }
}

test('processRefine calls complete(), stores the envelope as resultText, marks done', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'refine', tier: 'standard', status: 'queued' })
  let seen = null
  const fakeResolve = () => ({ providers: [
    { provider: 'groq', adapter: { isConfigured: () => true, complete: async (args) => { seen = args; return ENVELOPE } }, model: 'llama' },
  ] })
  await processRefine(runData(job, wsId, uid), { resolveFn: fakeResolve })
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.equal(updated.resultText, ENVELOPE)
  // complete() received the json flag + the series/instruction in the user message
  assert.equal(seen.json, true)
  assert.match(seen.user, /CURRENT SERIES JSON:/)
  assert.match(seen.user, /USER REQUEST:/)
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, action: 'refine', success: true, provider: 'groq' }), 1)
})

test('processRefine stores a revise envelope verbatim', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'refine', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ providers: [
    { provider: 'groq', adapter: { isConfigured: () => true, complete: async () => REVISE_ENVELOPE }, model: 'llama' },
  ] })
  await processRefine(runData(job, wsId, uid, { instruction: 'make it darker' }), { resolveFn: fakeResolve })
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.equal(updated.resultText, REVISE_ENVELOPE)
})

test('processRefine failover: first provider throws → second is used', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'refine', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ providers: [
    { provider: 'groq',   adapter: { isConfigured: () => true, complete: async () => { throw new Error('groq down') } }, model: 'llama' },
    { provider: 'gemini', adapter: { isConfigured: () => true, complete: async () => ENVELOPE }, model: 'gemini' },
  ] })
  await processRefine(runData(job, wsId, uid), { resolveFn: fakeResolve })
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.equal(updated.resultText, ENVELOPE)
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, action: 'refine', success: true, provider: 'gemini' }), 1)
})

test('processRefine skips unconfigured providers without calling them', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'refine', tier: 'standard', status: 'queued' })
  const firstCalled = { called: false }
  const fakeResolve = () => ({ providers: [
    { provider: 'groq',   adapter: { isConfigured: () => false, complete: async () => { firstCalled.called = true; return '{}' } }, model: 'llama' },
    { provider: 'gemini', adapter: { isConfigured: () => true,  complete: async () => ENVELOPE }, model: 'gemini' },
  ] })
  await processRefine(runData(job, wsId, uid), { resolveFn: fakeResolve })
  assert.equal(firstCalled.called, false)
  assert.equal((await Job.findById(job._id)).status, 'done')
})

test('processRefine: all providers throw → marks failed, logs failure, re-throws', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'refine', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ providers: [
    { provider: 'groq',   adapter: { isConfigured: () => true, complete: async () => { throw new Error('groq down') } }, model: 'llama' },
    { provider: 'gemini', adapter: { isConfigured: () => true, complete: async () => { throw new Error('gemini down') } }, model: 'gemini' },
  ] })
  await assert.rejects(() => processRefine(runData(job, wsId, uid), { resolveFn: fakeResolve }), /gemini down/)
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'failed')
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, action: 'refine', success: false }), 1)
})

test('processRefine: all providers unconfigured → fails with clear error', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'refine', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ providers: [
    { provider: 'groq', adapter: { isConfigured: () => false, complete: async () => '{}' }, model: 'llama' },
  ] })
  await assert.rejects(
    () => processRefine(runData(job, wsId, uid), { resolveFn: fakeResolve }),
    /No configured provider/
  )
  assert.equal((await Job.findById(job._id)).status, 'failed')
})
