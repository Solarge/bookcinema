import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generate as replicateGen, isConfigured as replicateIsConfigured } from '../generation/providers/replicateImage.js'
import { generate as falaiGen, isConfigured as falaiIsConfigured } from '../generation/providers/falaiImage.js'
import { generate as stabilityGen, isConfigured as stabilityIsConfigured } from '../generation/providers/stabilityImage.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; delete process.env.REPLICATE_API_TOKEN; delete process.env.FALAI_KEY; delete process.env.STABILITY_API_KEY })

// Queue of responses; each fetch() call shifts the next one.
function mockSequence(responses) {
  const q = [...responses]
  globalThis.fetch = async () => {
    const r = q.shift()
    return { ok: r.ok !== false, status: r.status || 200, json: async () => r.json || {}, arrayBuffer: async () => new TextEncoder().encode(r.bytes || 'img').buffer }
  }
}

test('replicate image: succeeded inline -> downloads bytes', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test'
  mockSequence([ { json: { status: 'succeeded', output: ['https://img/x.jpg'] } }, { bytes: 'IMG' } ])
  const r = await replicateGen({ prompt: 'a fox', aspectRatio: '9:16' })
  assert.ok(Buffer.isBuffer(r.buffer)); assert.equal(r.mimeType, 'image/jpeg'); assert.equal(r.ext, 'jpg')
})

test('replicate image: missing key throws', async () => {
  delete process.env.REPLICATE_API_TOKEN
  await assert.rejects(() => replicateGen({ prompt: 'x' }), /Replicate/)
})

test('fal.ai image: returns image url -> downloads bytes', async () => {
  process.env.FALAI_KEY = 'fal_test'
  mockSequence([ { json: { images: [{ url: 'https://img/y.jpg' }] } }, { bytes: 'IMG' } ])
  const r = await falaiGen({ prompt: 'a fox', aspectRatio: '1:1' })
  assert.ok(Buffer.isBuffer(r.buffer)); assert.equal(r.ext, 'jpg')
})

test('fal.ai image: missing key throws', async () => {
  delete process.env.FALAI_KEY
  await assert.rejects(() => falaiGen({ prompt: 'x' }), /fal\.ai/)
})

test('replicate image: provider error surfaced', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test'
  mockSequence([ { ok: false, status: 500, json: { detail: 'server error' } } ])
  await assert.rejects(() => replicateGen({ prompt: 'x' }), /Replicate|server error|500/)
})

test('replicate image: processing then polls to succeeded -> downloads bytes', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test'
  mockSequence([
    { json: { status: 'processing', id: 'pred1' } }, // initial POST (Prefer:wait returns not-yet-done)
    { json: { status: 'succeeded', output: ['https://img/z.jpg'] } }, // poll #1
    { bytes: 'IMG' }, // download
  ])
  const r = await replicateGen({ prompt: 'a fox', aspectRatio: '9:16' })
  assert.ok(Buffer.isBuffer(r.buffer)); assert.equal(r.ext, 'jpg')
})
test('replicateImage.isConfigured reflects REPLICATE_API_TOKEN presence', () => {
  delete process.env.REPLICATE_API_TOKEN
  assert.equal(replicateIsConfigured(), false)
  process.env.REPLICATE_API_TOKEN = 'r8_x'
  assert.equal(replicateIsConfigured(), true)
})
test('falaiImage.isConfigured reflects FALAI_KEY presence', () => {
  delete process.env.FALAI_KEY
  assert.equal(falaiIsConfigured(), false)
  process.env.FALAI_KEY = 'fal_x'
  assert.equal(falaiIsConfigured(), true)
})

// ─── stabilityImage tests ─────────────────────────────────────────────────────

test('stabilityImage.isConfigured reflects STABILITY_API_KEY presence', () => {
  delete process.env.STABILITY_API_KEY
  assert.equal(stabilityIsConfigured(), false)
  process.env.STABILITY_API_KEY = 'sk-stab-x'
  assert.equal(stabilityIsConfigured(), true)
})

test('stabilityImage returns png buffer from raw image bytes', async () => {
  process.env.STABILITY_API_KEY = 'sk-stab-test'
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    arrayBuffer: async () => new TextEncoder().encode('PNG').buffer,
    json: async () => ({}),
  })
  const r = await stabilityGen({ prompt: 'a castle', aspectRatio: '16:9' })
  assert.ok(Buffer.isBuffer(r.buffer))
  assert.equal(r.mimeType, 'image/png')
  assert.equal(r.ext, 'png')
})

test('stabilityImage throws when key missing', async () => {
  delete process.env.STABILITY_API_KEY
  await assert.rejects(() => stabilityGen({ prompt: 'x' }), /Stability/)
})

test('stabilityImage surfaces provider error', async () => {
  process.env.STABILITY_API_KEY = 'sk-stab-test'
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ errors: ['invalid aspect_ratio'] }) })
  await assert.rejects(() => stabilityGen({ prompt: 'x' }), /invalid aspect_ratio|400/)
})
