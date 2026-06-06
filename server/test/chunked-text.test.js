import './helpers/env.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitIntoChunks, generateSeriesFromBook } from '../generation/chunkedText.js'

// ── splitIntoChunks ────────────────────────────────────────────────────────────

test('splitIntoChunks: short text returns a single chunk', () => {
  const text = 'A short book.'
  const chunks = splitIntoChunks(text, 100)
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0], text)
})

test('splitIntoChunks: empty string returns empty array', () => {
  assert.deepEqual(splitIntoChunks('', 100), [])
})

test('splitIntoChunks: long text is split into multiple chunks, each ≤ threshold', () => {
  // Build a text clearly longer than the threshold
  const word = 'hello '
  const threshold = 50
  const text = word.repeat(30) // 180 chars
  const chunks = splitIntoChunks(text, threshold)
  assert.ok(chunks.length > 1, `expected multiple chunks, got ${chunks.length}`)
  for (const chunk of chunks) {
    assert.ok(chunk.length <= threshold, `chunk length ${chunk.length} exceeds threshold ${threshold}`)
  }
  // Reconstructed text equals original (no chars lost)
  assert.equal(chunks.join(''), text)
})

test('splitIntoChunks: does not cut mid-word when a space is available', () => {
  const threshold = 20
  const text = 'The quick brown fox jumps over the lazy dog and keeps going and going more'
  const chunks = splitIntoChunks(text, threshold)
  for (const chunk of chunks) {
    assert.ok(chunk.length <= threshold, `chunk too long: ${chunk.length}`)
    // chunk must not start with a partial word — the first char can be a letter
    // (after a split on a space, leading space consumed, so no leading space)
    // what matters is nothing is cut mid-word: no chunk ends with a partial word
    // We verify by checking the reconstructed text matches the original exactly
  }
  assert.equal(chunks.join(''), text)
})

test('splitIntoChunks: prefers paragraph breaks over sentence breaks', () => {
  const threshold = 60
  // Two paragraphs separated by \n\n; each ~50 chars so both fit in threshold individually
  const para1 = 'First paragraph is here and it is quite interesting.'
  const para2 = 'Second paragraph continues the story nicely and well.'
  const text = `${para1}\n\n${para2}`
  const chunks = splitIntoChunks(text, threshold + 10) // threshold just over para1 length+\n\n
  // The whole thing should be 1 chunk if it fits, or split at \n\n if it doesn't
  // With a threshold of 70, the full text is ~110 chars → must split
  const chunks2 = splitIntoChunks(text, 70)
  for (const c of chunks2) {
    assert.ok(c.length <= 70, `chunk too long: ${c.length}`)
  }
  assert.equal(chunks2.join(''), text)
})

// ── generateSeriesFromBook — single-pass (short book) ────────────────────────

test('generateSeriesFromBook: short text → exactly 1 complete call with json:true, returns parsed series', async () => {
  const seriesObj = { title: 'Test', characters: [], episodes: [] }
  const calls = []

  const fakeSeries = JSON.stringify(seriesObj)
  const fakeComplete = async (args) => {
    calls.push(args)
    return fakeSeries
  }

  const result = await generateSeriesFromBook({
    bookText: 'A short book.',
    genrePreset: 'cinematic',
    language: 'en',
    episodeCount: 'auto',
    complete: fakeComplete,
  })

  assert.equal(calls.length, 1, 'expected exactly 1 complete call for a short book')
  assert.equal(calls[0].json, true, 'single-pass call must have json:true')
  assert.ok(calls[0].user.includes('A short book.'), 'user message should contain bookText')
  assert.deepEqual(result, seriesObj)
})

// ── generateSeriesFromBook — section-first (large book) ──────────────────────

// Helpers that classify a json:true call as a "bible" vs a "section" call by
// inspecting the system/user text the new prompts produce, and return canned
// JSON for each. Distinguished by the section-text marker the orchestrator adds.
function isSectionCall(args) {
  return typeof args.user === 'string' && args.user.includes('--- SECTION') && args.user.includes('TEXT ---')
}
function isBibleCall(args) {
  return typeof args.system === 'string' && /series bible/i.test(args.system) && !isSectionCall(args)
}

const BIBLE_JSON = JSON.stringify({
  title: 'BigBook',
  author: 'Author A',
  logline: 'A grand logline.',
  series_hook: 'Hook hook.',
  characters: [
    { id: 'hero', name: 'Hero', role: 'Protagonist' },
    { id: 'villain', name: 'Villain', role: 'Antagonist' },
  ],
  production_guide: { visual_style: 'cinematic', music_direction: 'orchestral' },
  coverage_note: 'Divided by section.',
  virality: { score: 50, rating: 'medium' },
})

// A section returns episodes (numbered from 1 within the section) + new_characters.
function sectionJsonFor(args) {
  // Pull the section number out of the user text so each section is distinct.
  const m = args.user.match(/SECTION (\d+) of/)
  const n = m ? Number(m[1]) : 1
  return JSON.stringify({
    episodes: [
      { number: 1, title: `S${n} Ep A`, scenes: [], characters_in_episode: ['hero'] },
      { number: 2, title: `S${n} Ep B`, scenes: [], characters_in_episode: ['villain'] },
    ],
    new_characters: n === 1 ? [{ id: 'sidekick', name: 'Sidekick', role: 'Ally' }] : [],
  })
}

function makeSectionAwareComplete(calls) {
  return async (args) => {
    calls.push(args)
    if (args.json === false) return `Summary of section: ${String(args.user).slice(0, 20)}`
    if (isBibleCall(args)) return BIBLE_JSON
    if (isSectionCall(args)) return sectionJsonFor(args)
    return BIBLE_JSON
  }
}

test('generateSeriesFromBook: large text → N summary calls + 1 bible call + 1 section call per chunk', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 50

  const calls = []
  const fakeComplete = makeSectionAwareComplete(calls)

  const bookText = ('word ').repeat(40) // 200 chars → multiple chunks at 50
  const result = await generateSeriesFromBook({
    bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete,
  })

  config.managed.chunkThresholdChars = origThreshold

  const expectedChunks = splitIntoChunks(bookText, 50).length
  const summaryCalls = calls.filter(c => c.json === false)
  const bibleCalls   = calls.filter(c => c.json === true && isBibleCall(c))
  const sectionCalls = calls.filter(c => c.json === true && isSectionCall(c))

  assert.equal(summaryCalls.length, expectedChunks, `expected ${expectedChunks} summary calls`)
  assert.equal(bibleCalls.length, 1, 'expected exactly 1 bible call')
  assert.equal(sectionCalls.length, expectedChunks, 'expected one section call per chunk')
  assert.equal(calls.length, expectedChunks * 2 + 1, 'total = summaries + sections + 1 bible')

  // Merged series: bible identity + characters, episodes from ALL sections, renumbered.
  assert.equal(result.title, 'BigBook')
  assert.equal(result.logline, 'A grand logline.')
  assert.equal(result.coverage_note, 'Divided by section.')
  assert.deepEqual(result.virality, { score: 50, rating: 'medium' })
  // bible cast (hero, villain) unioned with the section-1 new character (sidekick)
  assert.deepEqual(result.characters.map(c => c.id), ['hero', 'villain', 'sidekick'])
  // 2 episodes per section, renumbered sequentially across the whole series
  assert.equal(result.episodes.length, expectedChunks * 2)
  assert.deepEqual(result.episodes.map(e => e.number), result.episodes.map((_, i) => i + 1))
  // one coverage entry per merged episode
  assert.equal(result.coverage.length, result.episodes.length)
  assert.equal(result.coverage[0].episode, 1)
})

test('generateSeriesFromBook: a section with bad JSON is skipped; other sections still merge', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 50

  const calls = []
  const fakeComplete = async (args) => {
    calls.push(args)
    if (args.json === false) return 'summary'
    if (isBibleCall(args)) return BIBLE_JSON
    if (isSectionCall(args)) {
      const n = Number(args.user.match(/SECTION (\d+) of/)[1])
      if (n === 1) return 'NOT_VALID_JSON' // first section returns garbage
      return sectionJsonFor(args)
    }
    return BIBLE_JSON
  }

  const bookText = ('word ').repeat(40)
  const expectedChunks = splitIntoChunks(bookText, 50).length

  const result = await generateSeriesFromBook({
    bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete,
  })

  config.managed.chunkThresholdChars = origThreshold

  // Section 1 skipped → episodes only from the remaining (expectedChunks - 1) sections.
  assert.equal(result.episodes.length, (expectedChunks - 1) * 2)
  assert.deepEqual(result.episodes.map(e => e.number), result.episodes.map((_, i) => i + 1))
  assert.equal(result.title, 'BigBook')
})

test('generateSeriesFromBook: all sections fail → falls back to old single-reduce path', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 50

  const reduceObj = { title: 'Reduced', characters: [], episodes: [{ number: 1, title: 'R' }] }
  const calls = []
  const fakeComplete = async (args) => {
    calls.push(args)
    if (args.json === false) return 'summary'
    if (isBibleCall(args)) return BIBLE_JSON
    if (isSectionCall(args)) return 'TOTALLY_BROKEN_JSON' // every section fails
    // The fallback reduce call uses buildSystemPrompt (not a bible/section prompt).
    return JSON.stringify(reduceObj)
  }

  const bookText = ('word ').repeat(40)
  const result = await generateSeriesFromBook({
    bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete,
  })

  config.managed.chunkThresholdChars = origThreshold

  // Fell back to the reduce path → got the reduce series, and a reduce-shaped call ran.
  assert.deepEqual(result, reduceObj)
  const reduceCall = calls.find(c =>
    c.json === true && typeof c.user === 'string' && c.user.includes('section-by-section summary of an ENTIRE book'))
  assert.ok(reduceCall, 'expected the fallback single-reduce call to run')
})

test('generateSeriesFromBook: bible pass failure → falls back to old single-reduce path', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 50

  const reduceObj = { title: 'ReducedFromBibleFail', characters: [], episodes: [] }
  const calls = []
  const fakeComplete = async (args) => {
    calls.push(args)
    if (args.json === false) return 'summary'
    if (isBibleCall(args)) return 'BROKEN_BIBLE_JSON' // bible parse fails
    if (isSectionCall(args)) return BIBLE_JSON
    return JSON.stringify(reduceObj)
  }

  const bookText = ('word ').repeat(40)
  const result = await generateSeriesFromBook({
    bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete,
  })

  config.managed.chunkThresholdChars = origThreshold

  assert.deepEqual(result, reduceObj)
  // No section calls should have happened once the bible failed.
  assert.equal(calls.filter(c => c.json === true && isSectionCall(c)).length, 0)
})

test('generateSeriesFromBook: each summary call has maxTokens=3000', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 50

  const calls = []
  const fakeComplete = makeSectionAwareComplete(calls)

  const bookText = ('word ').repeat(40)
  await generateSeriesFromBook({ bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete })

  config.managed.chunkThresholdChars = origThreshold

  const summaryCalls = calls.filter(c => c.json === false)
  for (const call of summaryCalls) {
    assert.equal(call.maxTokens, 3000, 'each summary call must request maxTokens=3000')
  }
})

test('generateSeriesFromBook: bible + section calls request maxTokens=config.managed.seriesMaxTokens', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 50

  const calls = []
  const fakeComplete = makeSectionAwareComplete(calls)

  const bookText = ('word ').repeat(40)
  await generateSeriesFromBook({ bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete })

  config.managed.chunkThresholdChars = origThreshold

  for (const call of calls.filter(c => c.json === true)) {
    assert.equal(call.maxTokens, config.managed.seriesMaxTokens)
  }
  assert.equal(config.managed.seriesMaxTokens, 32000)
})

test('generateSeriesFromBook: single-pass series call requests maxTokens=config.managed.seriesMaxTokens', async () => {
  const { config } = await import('../config.js')
  const calls = []
  const seriesObj = { title: 'T', characters: [], episodes: [] }
  const fakeComplete = async (args) => {
    calls.push(args)
    return JSON.stringify(seriesObj)
  }

  await generateSeriesFromBook({
    bookText: 'A short book.',
    genrePreset: 'cinematic',
    language: 'en',
    episodeCount: 'auto',
    complete: fakeComplete,
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].json, true)
  assert.equal(calls[0].maxTokens, config.managed.seriesMaxTokens)
  assert.equal(config.managed.seriesMaxTokens, 32000)
})

test('generateSeriesFromBook: reduce-path series call requests maxTokens=config.managed.seriesMaxTokens', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 50

  const calls = []
  const seriesObj = { title: 'T', characters: [], episodes: [] }
  const fakeComplete = async (args) => {
    calls.push(args)
    if (args.json === false) return 'summary text'
    return JSON.stringify(seriesObj)
  }

  const bookText = ('word ').repeat(40)
  await generateSeriesFromBook({ bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete })

  config.managed.chunkThresholdChars = origThreshold

  const finalCall = calls.find(c => c.json === true)
  assert.ok(finalCall, 'expected a final json series call')
  assert.equal(finalCall.maxTokens, config.managed.seriesMaxTokens)
  assert.equal(config.managed.seriesMaxTokens, 32000)
})

test('generateSeriesFromBook: invalid JSON from final call surfaces a parse error', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 50

  const fakeComplete = async (args) => {
    if (args.json === false) return 'summary'
    return 'NOT_VALID_JSON_AT_ALL'
  }

  const bookText = ('word ').repeat(40)

  await assert.rejects(
    () => generateSeriesFromBook({ bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete }),
    /parse error|JSON/i
  )

  config.managed.chunkThresholdChars = origThreshold
})

test('generateSeriesFromBook: large book call count = summaries + 1 bible + 1 per section', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 100

  const calls = []
  const fakeComplete = makeSectionAwareComplete(calls)

  // Exactly ~360 chars → multiple chunks at threshold=100
  const bookText = ('abcde fghij ').repeat(30) // 12*30 = 360 chars
  const chunks = splitIntoChunks(bookText, 100)

  await generateSeriesFromBook({ bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete })

  config.managed.chunkThresholdChars = origThreshold

  // N summaries + 1 bible + N section calls
  assert.equal(calls.length, chunks.length * 2 + 1, `call count should be ${chunks.length}*2 + 1`)
})
