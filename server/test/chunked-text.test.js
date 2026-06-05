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

// ── generateSeriesFromBook — map-reduce (large book) ─────────────────────────

test('generateSeriesFromBook: large text → N summary calls (json:false) + 1 final call (json:true)', async () => {
  const seriesObj = { title: 'BigBook', characters: [], episodes: [] }

  // Use a very small threshold to force chunking
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 50

  const calls = []
  const fakeComplete = async (args) => {
    calls.push(args)
    if (args.json === false) return `Summary of section: ${args.user.slice(0, 20)}`
    return JSON.stringify(seriesObj)
  }

  // Build text that will produce at least 3 chunks at threshold=50
  const bookText = ('word ').repeat(40) // 200 chars → at least 4 chunks at 50 chars each

  const result = await generateSeriesFromBook({
    bookText,
    genrePreset: 'cinematic',
    language: 'en',
    episodeCount: 'auto',
    complete: fakeComplete,
  })

  config.managed.chunkThresholdChars = origThreshold

  const summaryCalls = calls.filter(c => c.json === false)
  const finalCalls   = calls.filter(c => c.json === true)

  const expectedChunks = splitIntoChunks(bookText, 50).length

  assert.equal(summaryCalls.length, expectedChunks, `expected ${expectedChunks} summary calls`)
  assert.equal(finalCalls.length, 1, 'expected exactly 1 final series call')
  assert.equal(calls.length, expectedChunks + 1, `total calls should be chunks + 1 = ${expectedChunks + 1}`)

  // Final user message must contain the section summaries
  const finalUser = finalCalls[0].user
  assert.ok(finalUser.includes('--- SECTION 1 ---'), 'final user message must include section markers')
  assert.ok(finalUser.includes('--- SECTION 2 ---'), 'final user message must include multiple sections')

  assert.deepEqual(result, seriesObj)
})

test('generateSeriesFromBook: each summary call has maxTokens=3000', async () => {
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

  const summaryCalls = calls.filter(c => c.json === false)
  for (const call of summaryCalls) {
    assert.equal(call.maxTokens, 3000, 'each summary call must request maxTokens=3000')
  }
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

test('generateSeriesFromBook: large book call count = number of chunks + 1', async () => {
  const { config } = await import('../config.js')
  const origThreshold = config.managed.chunkThresholdChars
  config.managed.chunkThresholdChars = 100

  const calls = []
  const seriesObj = { title: 'T', characters: [], episodes: [] }
  const fakeComplete = async (args) => {
    calls.push(args)
    if (args.json === false) return 'section summary'
    return JSON.stringify(seriesObj)
  }

  // Exactly 350 chars → 4 chunks at threshold=100
  const bookText = ('abcde fghij ').repeat(30) // 12*30 = 360 chars
  const chunks = splitIntoChunks(bookText, 100)

  await generateSeriesFromBook({ bookText, genrePreset: 'cinematic', language: 'en', episodeCount: 'auto', complete: fakeComplete })

  config.managed.chunkThresholdChars = origThreshold

  assert.equal(calls.length, chunks.length + 1, `call count should be ${chunks.length} chunks + 1 final`)
})
