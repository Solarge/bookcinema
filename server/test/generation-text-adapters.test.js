import './helpers/env.js'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generate as groqGenerate } from '../generation/providers/groqText.js'
import { generate as anthropicGenerate } from '../generation/providers/anthropicText.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; delete process.env.GROQ_API_KEY; delete process.env.ANTHROPIC_API_KEY })

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
