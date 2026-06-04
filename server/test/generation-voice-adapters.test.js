import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generate as openaiGen, isConfigured as openaiIsConfigured } from '../generation/providers/openaiTTSVoice.js'
import { generate as elevenGen, isConfigured as elevenIsConfigured } from '../generation/providers/elevenlabsVoice.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; delete process.env.OPENAI_API_KEY; delete process.env.ELEVENLABS_KEY })
function mockAudioOnce(ok = true, status = 200) {
  globalThis.fetch = async () => ({ ok, status, arrayBuffer: async () => new TextEncoder().encode('audio').buffer, json: async () => ({ error: { message: 'bad' }, detail: { message: 'bad' } }) })
}

test('openaiTTS returns mp3 buffer', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; mockAudioOnce()
  const r = await openaiGen({ text: 'hello', voiceId: 'nova' })
  assert.ok(Buffer.isBuffer(r.buffer)); assert.equal(r.mimeType, 'audio/mpeg'); assert.equal(r.ext, 'mp3')
})
test('openaiTTS throws when key missing', async () => {
  delete process.env.OPENAI_API_KEY
  await assert.rejects(() => openaiGen({ text: 'x' }), /OpenAI/)
})
test('elevenlabs returns mp3 buffer', async () => {
  process.env.ELEVENLABS_KEY = 'el-test'; mockAudioOnce()
  const r = await elevenGen({ text: 'hello' })
  assert.ok(Buffer.isBuffer(r.buffer)); assert.equal(r.ext, 'mp3')
})
test('elevenlabs throws when key missing', async () => {
  delete process.env.ELEVENLABS_KEY
  await assert.rejects(() => elevenGen({ text: 'x' }), /ElevenLabs/)
})
test('openaiTTS surfaces provider error', async () => {
  process.env.OPENAI_API_KEY = 'sk-test'; mockAudioOnce(false, 500)
  await assert.rejects(() => openaiGen({ text: 'x' }), /OpenAI|500/)
})
test('openaiTTSVoice.isConfigured reflects OPENAI_API_KEY presence', () => {
  delete process.env.OPENAI_API_KEY
  assert.equal(openaiIsConfigured(), false)
  process.env.OPENAI_API_KEY = 'sk-x'
  assert.equal(openaiIsConfigured(), true)
})
test('elevenlabsVoice.isConfigured reflects ELEVENLABS_KEY presence', () => {
  delete process.env.ELEVENLABS_KEY
  assert.equal(elevenIsConfigured(), false)
  process.env.ELEVENLABS_KEY = 'el-x'
  assert.equal(elevenIsConfigured(), true)
})
