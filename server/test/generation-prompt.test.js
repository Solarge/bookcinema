import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSystemPrompt } from '../generation/systemPrompt.js'

test('buildSystemPrompt returns the JSON-schema instruction and respects genre + language', () => {
  const p = buildSystemPrompt('cinematic', 'en')
  assert.match(p, /valid JSON object only/i)
  assert.match(p, /"characters"/)
  assert.match(p, /"episodes"/)
  assert.ok(p.length > 500)
  const fr = buildSystemPrompt('cinematic', 'fr')
  assert.notEqual(p, fr) // language instruction changes the prompt
})

test('buildSystemPrompt falls back to cinematic for an unknown preset', () => {
  const known = buildSystemPrompt('cinematic', 'en')
  const unknown = buildSystemPrompt('does-not-exist', 'en')
  assert.equal(typeof unknown, 'string')
  assert.ok(unknown.length > 500)
})
