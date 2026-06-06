import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generate, DEFAULT_MODEL, PRO_MODEL } from '../generation/providers/falaiVideo.js'
import { MANAGED_PROVIDERS } from '../generation/registry.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; delete process.env.FALAI_KEY })

// Stub fetch for the three-phase fal.ai video flow:
//   1) POST submit  -> { status_url } (capture the submit URL)
//   2) GET poll     -> COMPLETED with a video url (first poll, so only one 5s wait)
//   3) GET download -> bytes
// Returns an object so the test can read back the captured submit URL.
function stubFalVideoFetch() {
  const calls = { submitUrl: null }
  let phase = 0
  globalThis.fetch = async (url, opts) => {
    phase += 1
    if (phase === 1) {
      // submit
      calls.submitUrl = url
      assert.equal(opts.method, 'POST')
      return { ok: true, status: 200, json: async () => ({ status_url: 'https://queue.fal.run/status/xyz' }) }
    }
    if (phase === 2) {
      // poll — COMPLETED immediately so the adapter waits only once
      return { ok: true, status: 200, json: async () => ({ status: 'COMPLETED', response_url: 'https://cdn.fal/video.mp4' }) }
    }
    // download
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('VIDEOBYTES').buffer }
  }
  return calls
}

test('falai video: honors explicit Pro model in submit URL', async () => {
  process.env.FALAI_KEY = 'fal_test'
  const calls = stubFalVideoFetch()
  const r = await generate({ prompt: 'a dragon', aspectRatio: '9:16', duration: 5, model: PRO_MODEL })
  assert.equal(calls.submitUrl, 'https://queue.fal.run/fal-ai/kling-video/v1.6/pro/text-to-video')
  assert.equal(calls.submitUrl, `https://queue.fal.run/${PRO_MODEL}`)
  assert.ok(Buffer.isBuffer(r.buffer)); assert.equal(r.ext, 'mp4'); assert.equal(r.mimeType, 'video/mp4')
})

test('falai video: falls back to DEFAULT_MODEL when no model passed', async () => {
  process.env.FALAI_KEY = 'fal_test'
  const calls = stubFalVideoFetch()
  await generate({ prompt: 'a dragon', aspectRatio: '16:9', duration: 5 })
  assert.equal(calls.submitUrl, 'https://queue.fal.run/fal-ai/kling-video/v1.6/standard/text-to-video')
  assert.equal(calls.submitUrl, `https://queue.fal.run/${DEFAULT_MODEL}`)
})

test('registry: premium video leads with Pro model and ends with a standard falai fallback', () => {
  const providers = MANAGED_PROVIDERS.video.premium.providers
  // engine is the inert primary; the cloud chain leads with the falai Pro model
  assert.equal(providers[0].provider, 'engine')
  assert.equal(providers[1].provider, 'falai')
  assert.equal(providers[1].model, PRO_MODEL)
  const last = providers[providers.length - 1]
  assert.equal(last.provider, 'falai')
  assert.equal(last.model, DEFAULT_MODEL)
  // standard tier stays on the standard falai model (unchanged)
  const std = MANAGED_PROVIDERS.video.standard.providers.find(p => p.provider === 'falai')
  assert.equal(std.model, DEFAULT_MODEL)
})
