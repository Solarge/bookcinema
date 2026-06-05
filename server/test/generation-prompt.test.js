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
  const unknown = buildSystemPrompt('does-not-exist', 'en')
  assert.equal(typeof unknown, 'string')
  assert.ok(unknown.length > 500)
})

// ── episodeCount parameterisation ────────────────────────────────────────────

test('buildSystemPrompt default (no episodeCount arg) produces 7-episode prompt', () => {
  const p = buildSystemPrompt('cinematic', 'en')
  assert.match(p, /7-episode/)
  assert.match(p, /Generate all 7 episodes/)

})

test('buildSystemPrompt with episodeCount=5 produces 5-episode prompt', () => {
  const p = buildSystemPrompt('cinematic', 'en', 5)
  assert.match(p, /5-episode/)
  assert.match(p, /Generate all 5 episodes/)
  assert.doesNotMatch(p, /7-episode/)
})

test('buildSystemPrompt clamps episodeCount=99 to 12', () => {
  const p = buildSystemPrompt('cinematic', 'en', 99)
  assert.match(p, /12-episode/)
  assert.match(p, /Generate all 12 episodes/)
})

test('buildSystemPrompt clamps episodeCount=1 to 3', () => {
  const p = buildSystemPrompt('cinematic', 'en', 1)
  assert.match(p, /3-episode/)
  assert.match(p, /Generate all 3 episodes/)
})

test('buildSystemPrompt clamps episodeCount=0 to 3', () => {
  const p = buildSystemPrompt('cinematic', 'en', 0)
  assert.match(p, /3-episode/)
})

test('buildSystemPrompt handles invalid episodeCount (NaN/string) by defaulting to 7', () => {
  const p = buildSystemPrompt('cinematic', 'en', 'bad')
  assert.match(p, /7-episode/)
})

test('buildSystemPrompt handles episodeCount=3 (lower bound)', () => {
  const p = buildSystemPrompt('cinematic', 'en', 3)
  assert.match(p, /3-episode/)
  assert.match(p, /Generate all 3 episodes/)
})

test('buildSystemPrompt handles episodeCount=12 (upper bound)', () => {
  const p = buildSystemPrompt('cinematic', 'en', 12)
  assert.match(p, /12-episode/)
  assert.match(p, /Generate all 12 episodes/)
})
