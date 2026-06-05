import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generate, isConfigured, DEFAULT_MODEL } from '../generation/providers/falaiMusic.js'
import { MANAGED_PROVIDERS } from '../generation/registry.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; delete process.env.FALAI_KEY })

// Stub fetch for the three-phase fal.ai music flow:
//   1) POST submit  -> { status_url } (capture the submit URL + body)
//   2) GET poll     -> COMPLETED with an audio url (first poll, so only one 5s wait)
//   3) GET download -> bytes
// Returns an object so the test can read back the captured submit URL/body.
function stubFalMusicFetch(contentType = 'audio/mpeg') {
  const calls = { submitUrl: null, submitBody: null }
  let phase = 0
  globalThis.fetch = async (url, opts) => {
    phase += 1
    if (phase === 1) {
      // submit
      calls.submitUrl = url
      calls.submitBody = JSON.parse(opts.body)
      assert.equal(opts.method, 'POST')
      return { ok: true, status: 200, json: async () => ({ status_url: 'https://queue.fal.run/status/xyz' }) }
    }
    if (phase === 2) {
      // poll — COMPLETED immediately so the adapter waits only once
      return { ok: true, status: 200, json: async () => ({ status: 'COMPLETED', response_url: 'https://cdn.fal/music.mp3' }) }
    }
    // download
    return {
      ok: true,
      status: 200,
      headers: { get: () => contentType },
      arrayBuffer: async () => new TextEncoder().encode('MUSICBYTES').buffer,
    }
  }
  return calls
}

test('falaiMusic.DEFAULT_MODEL is fal-ai/stable-audio', () => {
  assert.equal(DEFAULT_MODEL, 'fal-ai/stable-audio')
})

test('falai music: submits to DEFAULT_MODEL queue url with prompt, polls, downloads buffer', async () => {
  process.env.FALAI_KEY = 'fal_test'
  const calls = stubFalMusicFetch()
  const r = await generate({ prompt: 'epic orchestral score', duration: 30 })
  assert.equal(calls.submitUrl, 'https://queue.fal.run/fal-ai/stable-audio')
  assert.equal(calls.submitUrl, `https://queue.fal.run/${DEFAULT_MODEL}`)
  assert.equal(calls.submitBody.prompt, 'epic orchestral score')
  assert.equal(calls.submitBody.seconds_total, 30)
  assert.equal(calls.submitBody.duration, 30)
  assert.ok(Buffer.isBuffer(r.buffer))
  assert.equal(r.mimeType, 'audio/mpeg')
  assert.equal(r.ext, 'mp3')
})

test('falai music: honors explicit model in submit url', async () => {
  process.env.FALAI_KEY = 'fal_test'
  const calls = stubFalMusicFetch()
  await generate({ prompt: 'ambient pad', model: 'fal-ai/minimax-music' })
  assert.equal(calls.submitUrl, 'https://queue.fal.run/fal-ai/minimax-music')
})

test('falai music: detects wav from content-type', async () => {
  process.env.FALAI_KEY = 'fal_test'
  stubFalMusicFetch('audio/wav')
  const r = await generate({ prompt: 'tense strings' })
  assert.equal(r.mimeType, 'audio/wav')
  assert.equal(r.ext, 'wav')
})

test('falai music: missing key throws', async () => {
  delete process.env.FALAI_KEY
  await assert.rejects(() => generate({ prompt: 'x' }), /fal\.ai/)
})

test('falaiMusic.isConfigured reflects FALAI_KEY presence', () => {
  delete process.env.FALAI_KEY
  assert.equal(isConfigured(), false)
  process.env.FALAI_KEY = 'fal_x'
  assert.equal(isConfigured(), true)
})

test('registry: music tiers include falai as a second provider whose adapter is falaiMusic', async () => {
  const falaiMusic = await import('../generation/providers/falaiMusic.js')
  for (const tier of ['standard', 'premium']) {
    const providers = MANAGED_PROVIDERS.music[tier].providers
    assert.ok(providers.length >= 2, `music/${tier} should have >= 2 providers`)
    const falai = providers.find(p => p.provider === 'falai')
    assert.ok(falai, `music/${tier} should include a falai provider`)
    assert.equal(falai.adapter, falaiMusic, `music/${tier} falai adapter should be falaiMusic`)
    // replicate stays first (primary), falai is the appended fallback
    assert.equal(providers[0].provider, 'replicate')
  }
})
