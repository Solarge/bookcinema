/**
 * Chunked (map-reduce) full-book text generation.
 *
 * For books longer than `threshold` characters the module:
 *   1. Splits the text into ≤threshold-char chunks on paragraph/sentence boundaries.
 *   2. Summarises each chunk (map) with a plain-text LLM call.
 *   3. Joins the summaries and runs the normal series-generation call (reduce).
 *
 * Short books (≤threshold) are sent in a single pass — identical to the original behaviour.
 *
 * The `complete` function injected by each adapter does the actual LLM call so the
 * orchestration always uses the *same* provider for both summary and series calls.
 */

import { buildSystemPrompt } from './systemPrompt.js'
import { parseSeriesJson } from './parseSeriesJson.js'
import { config } from '../config.js'

// Instructs the model to produce a faithful, dense prose summary of ONE section.
// Plain text — no JSON — so the model spends its output tokens on content, not formatting.
const SUMMARY_SYSTEM = `You are a literary analyst producing detailed faithful prose summaries for a book-to-series production pipeline.

Summarise the provided section of a book in rich, specific prose. Preserve:
- Every key event and turning point, in chronological order
- All character names, relationships, and notable actions
- Important locations and settings
- Mood, tone, and thematic beats
- Any dialogue or specific phrasing that defines a character

Write in the third person, past tense. No preamble, no headings, no lists — continuous prose only. Do NOT skip, compress, or editorialize. Capture the section completely.`

/**
 * Split bookText into chunks of at most maxLen characters.
 * Splits prefer paragraph breaks (\n\n), then sentence-end punctuation, then spaces.
 * Never cuts mid-word.
 *
 * @param {string} text
 * @param {number} maxLen
 * @returns {string[]}
 */
export function splitIntoChunks(text, maxLen) {
  if (!text || text.length === 0) return []
  if (text.length <= maxLen) return [text]

  const chunks = []
  let remaining = text

  while (remaining.length > maxLen) {
    let cutAt = maxLen

    // Prefer a paragraph break (blank line)
    const parBreak = remaining.lastIndexOf('\n\n', maxLen)
    if (parBreak > maxLen * 0.5) {
      cutAt = parBreak + 2 // include the newlines in the first chunk
    } else {
      // Try sentence-end punctuation followed by a space/newline
      const sentEnd = remaining.slice(0, maxLen).search(/[.!?][^\S\n]*[\s](?=[A-Z\n"])/)
      // lastIndexOf-style: walk back from maxLen
      let best = -1
      for (let i = maxLen - 1; i > maxLen * 0.5; i--) {
        const ch = remaining[i]
        const next = remaining[i + 1]
        if ((ch === '.' || ch === '!' || ch === '?') && (next === ' ' || next === '\n')) {
          best = i + 1
          break
        }
      }
      if (best > maxLen * 0.5) {
        cutAt = best
      } else {
        // Fall back to the last space before maxLen (never cut mid-word)
        const spaceAt = remaining.lastIndexOf(' ', maxLen)
        if (spaceAt > maxLen * 0.5) {
          cutAt = spaceAt + 1
        }
        // Last resort: cut at maxLen exactly (worst case: mid-word only if no spaces found)
      }
    }

    chunks.push(remaining.slice(0, cutAt))
    remaining = remaining.slice(cutAt)
  }

  if (remaining.length > 0) chunks.push(remaining)
  return chunks
}

/**
 * Generate a series from a book, using chunked map-reduce for large inputs.
 *
 * @param {object} opts
 * @param {string}   opts.bookText
 * @param {string}   [opts.genrePreset='cinematic']
 * @param {string}   [opts.language='en']
 * @param {number|string} [opts.episodeCount='auto']
 * @param {Function} opts.complete   - async ({system, user, json?, maxTokens?, model?}) => string
 * @returns {Promise<object>} parsed series object
 */
export async function generateSeriesFromBook({
  bookText,
  genrePreset = 'cinematic',
  language = 'en',
  episodeCount = 'auto',
  complete,
}) {
  const threshold = config.managed.chunkThresholdChars

  // ── Single-pass path (short book) ──────────────────────────────────────────
  if (bookText.length <= threshold) {
    const raw = await complete({
      system: buildSystemPrompt(genrePreset, language, episodeCount),
      user: `Here is the book to transform into a cinematic series:\n\n${bookText}`,
      json: true,
    })
    return parseSeriesJson(raw)
  }

  // ── Map-reduce path (large book) ───────────────────────────────────────────
  const chunks = splitIntoChunks(bookText, threshold)

  // Map: summarise each chunk (sequentially to respect rate limits)
  const summaries = []
  for (let i = 0; i < chunks.length; i++) {
    // Run up to 3 at a time to avoid hammering rate limits
    summaries.push(
      await complete({
        system: SUMMARY_SYSTEM,
        user: chunks[i],
        json: false,
        maxTokens: 3000,
      })
    )
  }

  // Reduce: combine summaries and generate the series
  const combined = summaries
    .map((s, i) => `--- SECTION ${i + 1} ---\n\n${s}`)
    .join('\n\n')

  const raw = await complete({
    system: buildSystemPrompt(genrePreset, language, episodeCount),
    user: `The following is a faithful, complete, section-by-section summary of an ENTIRE book. Adapt the WHOLE work into the series — cover every section:\n\n${combined}`,
    json: true,
  })
  return parseSeriesJson(raw)
}
