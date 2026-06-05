import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generate as musicGen, isConfigured as musicIsConfigured, DEFAULT_MODEL } from '../generation/providers/replicateMusic.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; delete process.env.REPLICATE_API_TOKEN })

// Queue of responses; each fetch() call shifts the next one.
function mockSequence(responses) {
  const q = [...responses]
  globalThis.fetch = async () => {
    const r = q.shift()
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      headers: { get: () => r.contentType || 'audio/mpeg' },
      json: async () => r.json || {},
      arrayBuffer: async () => new TextEncoder().encode(r.bytes || 'mp3').buffer,
    }
  }
}

test('replicateMusic.DEFAULT_MODEL is meta/musicgen', () => {
  assert.equal(DEFAULT_MODEL, 'meta/musicgen')
})

test('replicate music: succeeded inline -> submits prompt/duration and downloads buffer', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test'
  let submittedBody = null
  const q = [
    { json: { status: 'succeeded', output: 'https://audio/x.mp3' } },
    { bytes: 'MP3', contentType: 'audio/mpeg' },
  ]
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'POST') submittedBody = JSON.parse(opts.body)
    const r = q.shift()
    return {
      ok: r.ok !== false, status: r.status || 200,
      headers: { get: () => r.contentType || 'audio/mpeg' },
      json: async () => r.json || {},
      arrayBuffer: async () => new TextEncoder().encode(r.bytes || 'mp3').buffer,
    }
  }
  const r = await musicGen({ prompt: 'epic orchestral score', duration: 30 })
  assert.ok(Buffer.isBuffer(r.buffer))
  assert.equal(r.mimeType, 'audio/mpeg')
  assert.equal(r.ext, 'mp3')
  assert.equal(submittedBody.input.prompt, 'epic orchestral score')
  assert.equal(submittedBody.input.duration, 30)
})

test('replicate music: detects wav from content-type', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test'
  mockSequence([
    { json: { status: 'succeeded', output: ['https://audio/y.wav'] } },
    { bytes: 'WAV', contentType: 'audio/wav' },
  ])
  const r = await musicGen({ prompt: 'ambient pad' })
  assert.equal(r.mimeType, 'audio/wav')
  assert.equal(r.ext, 'wav')
})

test('replicate music: processing then polls to succeeded -> downloads buffer', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test'
  mockSequence([
    { json: { status: 'processing', id: 'pred-music-1' } }, // POST not-yet-done
    { json: { status: 'succeeded', output: 'https://audio/z.mp3' } }, // poll #1
    { bytes: 'MP3' }, // download
  ])
  const r = await musicGen({ prompt: 'tense strings', duration: 20 })
  assert.ok(Buffer.isBuffer(r.buffer))
  assert.equal(r.ext, 'mp3')
})

test('replicate music: missing key throws', async () => {
  delete process.env.REPLICATE_API_TOKEN
  await assert.rejects(() => musicGen({ prompt: 'x' }), /Replicate/)
})

test('replicate music: provider error surfaced', async () => {
  process.env.REPLICATE_API_TOKEN = 'r8_test'
  mockSequence([{ ok: false, status: 500, json: { detail: 'server error' } }])
  await assert.rejects(() => musicGen({ prompt: 'x' }), /Replicate|server error|500/)
})

test('replicateMusic.isConfigured reflects REPLICATE_API_TOKEN presence', () => {
  delete process.env.REPLICATE_API_TOKEN
  assert.equal(musicIsConfigured(), false)
  process.env.REPLICATE_API_TOKEN = 'r8_x'
  assert.equal(musicIsConfigured(), true)
})
