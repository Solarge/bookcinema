import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generate as groqGenerate, isConfigured as groqIsConfigured } from '../generation/providers/groqText.js'
import { generate as anthropicGenerate, isConfigured as anthropicIsConfigured } from '../generation/providers/anthropicText.js'
import { generate as geminiGenerate, isConfigured as geminiIsConfigured } from '../generation/providers/geminiText.js'
import { generate as deepseekGenerate, isConfigured as deepseekIsConfigured } from '../generation/providers/deepseekText.js'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.GROQ_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.DEEPSEEK_API_KEY
})

function mockFetchOnce(jsonBody, ok = true, status = 200) {
  globalThis.fetch = async () => ({ ok, status, json: async () => jsonBody, text: async () => JSON.stringify(jsonBody) })
}

test('groqText.generate parses the chat-completion content into a series object', async () => {
  process.env.GROQ_API_KEY = 'test-key'
  mockFetchOnce({ choices: [{ message: { content: JSON.stringify({ title: 'T', characters: [], episodes: [] }) } }] })
  const series = await groqGenerate({ bookText: 'a book', genrePreset: 'cinematic', language: 'en' })
  assert.equal(series.title, 'T')
})

test('groqText.generate throws a clear error when the key is missing', async () => {
  delete process.env.GROQ_API_KEY
  await assert.rejects(() => groqGenerate({ bookText: 'x', genrePreset: 'cinematic', language: 'en' }), /Groq/)
})

test('groqText.generate surfaces a provider error body', async () => {
  process.env.GROQ_API_KEY = 'test-key'
  mockFetchOnce({ error: { message: 'rate limited' } }, false, 429)
  await assert.rejects(() => groqGenerate({ bookText: 'x', genrePreset: 'cinematic', language: 'en' }), /rate limited|429/)
})

test('anthropicText.generate parses the messages API content into a series object', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  mockFetchOnce({ content: [{ text: JSON.stringify({ title: 'A', characters: [], episodes: [] }) }], stop_reason: 'end_turn' })
  const series = await anthropicGenerate({ bookText: 'a book', genrePreset: 'cinematic', language: 'en' })
  assert.equal(series.title, 'A')
})

test('anthropicText.generate throws when key missing', async () => {
  delete process.env.ANTHROPIC_API_KEY
  await assert.rejects(() => anthropicGenerate({ bookText: 'x', genrePreset: 'cinematic', language: 'en' }), /Anthropic/)
})

test('groqText.generate tolerates trailing prose after a ```json fence', async () => {
  process.env.GROQ_API_KEY = 'test-key'
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    choices: [{ message: { content: '```json\n{"title":"Fenced","characters":[],"episodes":[]}\n```\n\nNote: hope this helps!' } }],
  }) })
  const series = await groqGenerate({ bookText: 'b', genrePreset: 'cinematic', language: 'en' })
  assert.equal(series.title, 'Fenced')
})

// ─── isConfigured() tests ─────────────────────────────────────────────────────

test('groqText.isConfigured returns true only when GROQ_API_KEY is set', () => {
  delete process.env.GROQ_API_KEY
  assert.equal(groqIsConfigured(), false)
  process.env.GROQ_API_KEY = 'test-key'
  assert.equal(groqIsConfigured(), true)
})

test('anthropicText.isConfigured returns true only when ANTHROPIC_API_KEY is set', () => {
  delete process.env.ANTHROPIC_API_KEY
  assert.equal(anthropicIsConfigured(), false)
  process.env.ANTHROPIC_API_KEY = 'test-key'
  assert.equal(anthropicIsConfigured(), true)
})

test('geminiText.isConfigured returns true only when GEMINI_API_KEY is set', () => {
  delete process.env.GEMINI_API_KEY
  assert.equal(geminiIsConfigured(), false)
  process.env.GEMINI_API_KEY = 'test-key'
  assert.equal(geminiIsConfigured(), true)
})

// ─── geminiText.generate tests ───────────────────────────────────────────────

test('geminiText.generate parses the Gemini API response into a series object', async () => {
  process.env.GEMINI_API_KEY = 'test-key'
  const seriesObj = { title: 'G', characters: [], episodes: [] }
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(seriesObj) }] }, finishReason: 'STOP' }] }),
  })
  const series = await geminiGenerate({ bookText: 'a book', genrePreset: 'cinematic', language: 'en' })
  assert.equal(series.title, 'G')
})

test('geminiText.generate throws a clear error when GEMINI_API_KEY is missing', async () => {
  delete process.env.GEMINI_API_KEY
  await assert.rejects(() => geminiGenerate({ bookText: 'x', genrePreset: 'cinematic', language: 'en' }), /Gemini/)
})

test('geminiText.generate surfaces a provider error body', async () => {
  process.env.GEMINI_API_KEY = 'test-key'
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota exceeded' } }) })
  await assert.rejects(() => geminiGenerate({ bookText: 'x', genrePreset: 'cinematic', language: 'en' }), /quota exceeded/)
})

test('geminiText.generate throws on MAX_TOKENS finishReason', async () => {
  process.env.GEMINI_API_KEY = 'test-key'
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'MAX_TOKENS' }] }),
  })
  await assert.rejects(() => geminiGenerate({ bookText: 'x', genrePreset: 'cinematic', language: 'en' }), /cut off/)
})

// ─── deepseekText tests ───────────────────────────────────────────────────────

test('deepseekText.isConfigured returns true only when DEEPSEEK_API_KEY is set', () => {
  delete process.env.DEEPSEEK_API_KEY
  assert.equal(deepseekIsConfigured(), false)
  process.env.DEEPSEEK_API_KEY = 'ds-test'
  assert.equal(deepseekIsConfigured(), true)
})

test('deepseekText.generate parses the chat-completion content into a series object', async () => {
  process.env.DEEPSEEK_API_KEY = 'ds-test'
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ title: 'DS', characters: [], episodes: [] }) } }] }),
  })
  const series = await deepseekGenerate({ bookText: 'a book', genrePreset: 'cinematic', language: 'en' })
  assert.equal(series.title, 'DS')
})

test('deepseekText.generate throws a clear error when the key is missing', async () => {
  delete process.env.DEEPSEEK_API_KEY
  await assert.rejects(() => deepseekGenerate({ bookText: 'x', genrePreset: 'cinematic', language: 'en' }), /DeepSeek/)
})

test('deepseekText.generate surfaces a provider error body', async () => {
  process.env.DEEPSEEK_API_KEY = 'ds-test'
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }) })
  await assert.rejects(() => deepseekGenerate({ bookText: 'x', genrePreset: 'cinematic', language: 'en' }), /rate limited|429/)
})

// ── episodeCount passthrough tests ────────────────────────────────────────────

test('groqText.generate passes episodeCount into the system prompt', async () => {
  process.env.GROQ_API_KEY = 'test-key'
  let capturedBody
  globalThis.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body)
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ title: 'T', characters: [], episodes: [] }) } }] }) }
  }
  await groqGenerate({ bookText: 'a book', genrePreset: 'cinematic', language: 'en', episodeCount: 5 })
  assert.match(capturedBody.messages[0].content, /5-episode/)
  assert.doesNotMatch(capturedBody.messages[0].content, /7-episode/)
})

test('anthropicText.generate passes episodeCount into the system prompt', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  let capturedBody
  globalThis.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body)
    return { ok: true, status: 200, json: async () => ({ content: [{ text: JSON.stringify({ title: 'A', characters: [], episodes: [] }) }], stop_reason: 'end_turn' }) }
  }
  await anthropicGenerate({ bookText: 'a book', genrePreset: 'cinematic', language: 'en', episodeCount: 10 })
  assert.match(capturedBody.system, /10-episode/)
  assert.doesNotMatch(capturedBody.system, /7-episode/)
})
