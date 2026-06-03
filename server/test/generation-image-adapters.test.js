import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generate as replicateGen } from '../generation/providers/replicateImage.js'
import { generate as falaiGen } from '../generation/providers/falaiImage.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; delete process.env.REPLICATE_API_TOKEN; delete process.env.FALAI_KEY })

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
