import './helpers/env.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addGenerationJob } from '../queue/generationQueue.js'

test('addGenerationJob enqueues a job with the expected name + payload', async () => {
  const calls = []
  const fakeQueue = { add: async (name, data, opts) => { calls.push({ name, data, opts }); return { id: 'job1' } } }
  const job = await addGenerationJob({ jobId: 'job-123', type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: 'w1', createdBy: 'u1' }, fakeQueue)
  assert.equal(job.id, 'job1')
  assert.equal(calls[0].name, 'generate')
  assert.equal(calls[0].data.jobId, 'job-123')
  assert.equal(calls[0].data.type, 'text')
  assert.equal(calls[0].data.tier, 'standard')
  assert.equal(calls[0].data.workspaceId, 'w1')
  assert.equal(calls[0].opts.attempts, 2)
})

test('addGenerationJob throws when no queue is available (no Redis, no override)', async () => {
  // env.js does not set REDIS_URL, so getGenerationQueue() returns null
  await assert.rejects(() => addGenerationJob({ type: 'text', tier: 'standard', payload: {}, workspaceId: 'w1' }), /queue unavailable|REDIS_URL/i)
})
