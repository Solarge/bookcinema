import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as engineImage from '../generation/providers/engineImage.js'
import * as engineVoice from '../generation/providers/engineVoice.js'
import * as engineVideo from '../generation/providers/engineVideo.js'
import * as engineMusic from '../generation/providers/engineMusic.js'
import * as engineText from '../generation/providers/engineText.js'
import { MANAGED_PROVIDERS } from '../generation/registry.js'

const realFetch = globalThis.fetch
const ENGINE_ENV = [
  'ENGINE_IMAGE_URL', 'ENGINE_VOICE_URL', 'ENGINE_VIDEO_URL', 'ENGINE_MUSIC_URL', 'ENGINE_TEXT_URL',
  'ENGINE_API_KEY', 'ENGINE_TIMEOUT_MS',
]
afterEach(() => {
  globalThis.fetch = realFetch
  for (const k of ENGINE_ENV) delete process.env[k]
})

// Build a fetch stub returning a sequence of responses. Each response:
//   { contentType, bytes }            -> raw-bytes response
//   { contentType:'application/json', json } -> JSON response (followed by a download response)
function mockSequence(responses) {
  const q = [...responses]
  globalThis.fetch = async () => {
    const r = q.shift()
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? (r.contentType || null) : null) },
      json: async () => r.json || {},
      text: async () => r.text || '',
      arrayBuffer: async () => new TextEncoder().encode(r.bytes || 'data').buffer,
    }
  }
}

// ─── isConfigured() reflects env ──────────────────────────────────────────────

test('engineImage.isConfigured reflects ENGINE_IMAGE_URL presence', () => {
  delete process.env.ENGINE_IMAGE_URL
  assert.equal(engineImage.isConfigured(), false)
  process.env.ENGINE_IMAGE_URL = 'http://engine:8000'
  assert.equal(engineImage.isConfigured(), true)
})

test('engineVoice.isConfigured reflects ENGINE_VOICE_URL presence', () => {
  delete process.env.ENGINE_VOICE_URL
  assert.equal(engineVoice.isConfigured(), false)
  process.env.ENGINE_VOICE_URL = 'http://engine:8001'
  assert.equal(engineVoice.isConfigured(), true)
})

// ─── engineImage.generate ─────────────────────────────────────────────────────

test('engineImage: raw png bytes -> buffer with matching mime/ext', async () => {
  process.env.ENGINE_IMAGE_URL = 'http://engine:8000'
  mockSequence([{ contentType: 'image/png', bytes: 'PNG' }])
  const r = await engineImage.generate({ prompt: 'a fox', aspectRatio: '9:16' })
  assert.ok(Buffer.isBuffer(r.buffer))
  assert.equal(r.mimeType, 'image/png')
  assert.equal(r.ext, 'png')
})

test('engineImage: raw webp bytes -> webp ext', async () => {
  process.env.ENGINE_IMAGE_URL = 'http://engine:8000'
  mockSequence([{ contentType: 'image/webp', bytes: 'WEBP' }])
  const r = await engineImage.generate({ prompt: 'a fox' })
  assert.equal(r.mimeType, 'image/webp')
  assert.equal(r.ext, 'webp')
})

test('engineImage: JSON { url } -> downloads bytes', async () => {
  process.env.ENGINE_IMAGE_URL = 'http://engine:8000'
  mockSequence([
    { contentType: 'application/json', json: { url: 'https://cdn/x.jpg' } },
    { contentType: 'image/jpeg', bytes: 'IMG' },
  ])
  const r = await engineImage.generate({ prompt: 'a fox' })
  assert.ok(Buffer.isBuffer(r.buffer))
  assert.equal(r.mimeType, 'image/jpeg')
  assert.equal(r.ext, 'jpg')
})

test('engineImage: sends Bearer auth only when ENGINE_API_KEY set', async () => {
  process.env.ENGINE_IMAGE_URL = 'http://engine:8000'
  process.env.ENGINE_API_KEY = 'secret123'
  let seenAuth = null
  globalThis.fetch = async (_url, opts) => {
    seenAuth = opts.headers.Authorization
    return {
      ok: true, status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new TextEncoder().encode('PNG').buffer,
      json: async () => ({}), text: async () => '',
    }
  }
  await engineImage.generate({ prompt: 'x' })
  assert.equal(seenAuth, 'Bearer secret123')
})

test('engineImage: error response surfaced', async () => {
  process.env.ENGINE_IMAGE_URL = 'http://engine:8000'
  mockSequence([{ ok: false, status: 500, text: 'boom' }])
  await assert.rejects(() => engineImage.generate({ prompt: 'x' }), /Engine image error 500/)
})

test('engineImage: throws when ENGINE_IMAGE_URL unset', async () => {
  delete process.env.ENGINE_IMAGE_URL
  await assert.rejects(() => engineImage.generate({ prompt: 'x' }), /ENGINE_IMAGE_URL/)
})

// ─── engineVoice.generate ─────────────────────────────────────────────────────

test('engineVoice: raw mp3 bytes -> buffer with matching mime/ext', async () => {
  process.env.ENGINE_VOICE_URL = 'http://engine:8001'
  mockSequence([{ contentType: 'audio/mpeg', bytes: 'MP3' }])
  const r = await engineVoice.generate({ text: 'hello', voiceId: 'v1' })
  assert.ok(Buffer.isBuffer(r.buffer))
  assert.equal(r.mimeType, 'audio/mpeg')
  assert.equal(r.ext, 'mp3')
})

test('engineVoice: raw wav bytes -> wav ext', async () => {
  process.env.ENGINE_VOICE_URL = 'http://engine:8001'
  mockSequence([{ contentType: 'audio/wav', bytes: 'WAV' }])
  const r = await engineVoice.generate({ text: 'hello' })
  assert.equal(r.mimeType, 'audio/wav')
  assert.equal(r.ext, 'wav')
})

test('engineVoice: JSON { url } -> downloads bytes', async () => {
  process.env.ENGINE_VOICE_URL = 'http://engine:8001'
  mockSequence([
    { contentType: 'application/json', json: { url: 'https://cdn/a.mp3' } },
    { contentType: 'audio/mpeg', bytes: 'AUDIO' },
  ])
  const r = await engineVoice.generate({ text: 'hello' })
  assert.ok(Buffer.isBuffer(r.buffer))
  assert.equal(r.ext, 'mp3')
})

test('engineVoice: error response surfaced', async () => {
  process.env.ENGINE_VOICE_URL = 'http://engine:8001'
  mockSequence([{ ok: false, status: 503, text: 'overloaded' }])
  await assert.rejects(() => engineVoice.generate({ text: 'x' }), /Engine voice error 503/)
})

test('engineVoice: throws when ENGINE_VOICE_URL unset', async () => {
  delete process.env.ENGINE_VOICE_URL
  await assert.rejects(() => engineVoice.generate({ text: 'x' }), /ENGINE_VOICE_URL/)
})

// ─── registry wiring ──────────────────────────────────────────────────────────

test('registry: engine is the primary image provider, cloud providers still follow', () => {
  for (const tier of ['standard', 'premium']) {
    const providers = MANAGED_PROVIDERS.image[tier].providers
    assert.equal(providers[0].provider, 'engine')
    assert.equal(providers[0].adapter, engineImage)
    assert.equal(providers[0].model, engineImage.DEFAULT_MODEL)
    // cloud providers still present after the engine entry
    assert.ok(providers.length >= 2)
    assert.ok(providers.slice(1).some(p => p.provider !== 'engine'))
  }
})

test('registry: engine is the primary voice provider, cloud providers still follow', () => {
  for (const tier of ['standard', 'premium']) {
    const providers = MANAGED_PROVIDERS.voice[tier].providers
    assert.equal(providers[0].provider, 'engine')
    assert.equal(providers[0].adapter, engineVoice)
    assert.equal(providers[0].model, engineVoice.DEFAULT_MODEL)
    assert.ok(providers.length >= 2)
    assert.ok(providers.slice(1).some(p => p.provider !== 'engine'))
  }
})
