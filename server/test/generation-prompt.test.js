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

// ── episodeCount: adaptive ('auto') by default, optional fixed override ───────

test('every prompt demands full coverage of the entire book', () => {
  for (const arg of [undefined, 'auto', 5, 0, 'bad']) {
    const p = buildSystemPrompt('cinematic', 'en', arg)
    assert.match(p, /cover the ENTIRE book/i)
  }
})

test('default (no episodeCount) is adaptive — the book decides, no fixed count', () => {
  const p = buildSystemPrompt('cinematic', 'en')
  assert.match(p, /Decide how many episodes/i)
  assert.doesNotMatch(p, /Generate exactly/)
})

test("episodeCount='auto' is adaptive", () => {
  const p = buildSystemPrompt('cinematic', 'en', 'auto')
  assert.match(p, /Decide how many episodes/i)
  assert.doesNotMatch(p, /Generate exactly/)
})

test('a specific episodeCount forces that count (and covers the whole book)', () => {
  const p = buildSystemPrompt('cinematic', 'en', 5)
  assert.match(p, /5-episode/)
  assert.match(p, /Generate exactly 5 episodes/)
  assert.doesNotMatch(p, /Decide how many episodes/i)
})

test('a very large episodeCount is sanity-capped at 24', () => {
  const p = buildSystemPrompt('cinematic', 'en', 99)
  assert.match(p, /Generate exactly 24 episodes/)
})

test('non-positive / invalid episodeCount falls back to adaptive', () => {
  for (const arg of [0, -3, 'bad', Number.NaN]) {
    const p = buildSystemPrompt('cinematic', 'en', arg)
    assert.match(p, /Decide how many episodes/i, `arg ${arg} should be adaptive`)
    assert.doesNotMatch(p, /Generate exactly/)
  }
})
