import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../config.js'
import { scoreCandidate } from '../generation/scoring.js'

// scoring.js reads config.engine.scoreUrl at call time, so we can mutate the
// already-imported config object to toggle the scorer between tests.
const realFetch = globalThis.fetch
const realScoreUrl = config.engine.scoreUrl
afterEach(() => {
  globalThis.fetch = realFetch
  config.engine.scoreUrl = realScoreUrl
})

test('scoring: scoreUrl unset → neutral 0.5 (inert, no fetch)', async () => {
  config.engine.scoreUrl = null
  let fetched = false
  globalThis.fetch = async () => { fetched = true; return {} }
  const score = await scoreCandidate({ type: 'image', buffer: Buffer.from('x'), mimeType: 'image/png', prompt: 'p' })
  assert.equal(score, 0.5)
  assert.equal(fetched, false, 'must not call the scorer when scoreUrl is unset')
})

test('scoring: no buffer → neutral 0.5 even when scoreUrl set', async () => {
  config.engine.scoreUrl = 'http://scorer/score'
  let fetched = false
  globalThis.fetch = async () => { fetched = true; return {} }
  const score = await scoreCandidate({ type: 'text', prompt: 'p' })
  assert.equal(score, 0.5)
  assert.equal(fetched, false)
})

test('scoring: scoreUrl set → returns the service score', async () => {
  config.engine.scoreUrl = 'http://scorer/score'
  let sentBody = null
  globalThis.fetch = async (_url, opts) => {
    sentBody = JSON.parse(opts.body)
    return { ok: true, json: async () => ({ score: 0.83 }) }
  }
  const score = await scoreCandidate({ type: 'image', buffer: Buffer.from('PNG'), mimeType: 'image/png', prompt: 'a fox', characterRef: 'ref1' })
  assert.equal(score, 0.83)
  // verify the transport: base64 bytes + metadata
  assert.equal(sentBody.type, 'image')
  assert.equal(sentBody.prompt, 'a fox')
  assert.equal(sentBody.character_ref, 'ref1')
  assert.equal(sentBody.mime, 'image/png')
  assert.equal(sentBody.data_base64, Buffer.from('PNG').toString('base64'))
})

test('scoring: clamps an out-of-range service score into [0,1]', async () => {
  config.engine.scoreUrl = 'http://scorer/score'
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ score: 5 }) })
  const score = await scoreCandidate({ type: 'image', buffer: Buffer.from('x'), mimeType: 'image/png' })
  assert.equal(score, 1)
})

test('scoring: non-numeric service score → neutral 0.5', async () => {
  config.engine.scoreUrl = 'http://scorer/score'
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ score: 'high' }) })
  const score = await scoreCandidate({ type: 'image', buffer: Buffer.from('x'), mimeType: 'image/png' })
  assert.equal(score, 0.5)
})

test('scoring: non-ok response → neutral 0.5', async () => {
  config.engine.scoreUrl = 'http://scorer/score'
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
  const score = await scoreCandidate({ type: 'image', buffer: Buffer.from('x'), mimeType: 'image/png' })
  assert.equal(score, 0.5)
})

test('scoring: fetch throws → neutral 0.5 (never blocks the job)', async () => {
  config.engine.scoreUrl = 'http://scorer/score'
  globalThis.fetch = async () => { throw new Error('network down') }
  const score = await scoreCandidate({ type: 'image', buffer: Buffer.from('x'), mimeType: 'image/png' })
  assert.equal(score, 0.5)
})
