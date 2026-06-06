/**
 * Chunked full-book text generation.
 *
 * Short books (≤threshold) are sent in a SINGLE pass — identical to the original behaviour.
 *
 * Large books (>threshold) use a SECTION-FIRST pipeline so episode count and detail scale
 * with the book's actual length (instead of being squeezed through one summary→reduce call):
 *   1. Split the text into ≤threshold-char chunks on paragraph/sentence boundaries.
 *   2. BIBLE pass: summarise each chunk (small calls), join them, then ONE call to produce the
 *      shared book-wide "series bible" (title, author, logline, series_hook, the full cast,
 *      production_guide, coverage_note, virality) — NO episodes.
 *   3. SECTION passes: for EACH chunk, ONE call that gets the bible (title + cast + style) plus
 *      the chunk's ACTUAL text and returns episodes[] dramatizing that section in full.
 *   4. MERGE: concat all sections' episodes in order, renumber 1..N, union the cast, build one
 *      coverage entry per episode, and stitch in the bible's shared fields.
 *
 * Resilience: a section call that fails or returns unparseable JSON is logged and SKIPPED. If
 * EVERY section fails, we fall back to the old summarise→single-reduce path so nothing regresses.
 *
 * The `complete` function injected by each adapter does the actual LLM call so the
 * orchestration always uses the *same* provider for every call.
 */

import { buildSystemPrompt } from './systemPrompt.js'
import { buildBiblePrompt, buildSectionPrompt } from './sectionPrompts.js'
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
      maxTokens: config.managed.seriesMaxTokens,
    })
    return parseSeriesJson(raw)
  }

  // ── Section-first path (large book) ────────────────────────────────────────
  const chunks = splitIntoChunks(bookText, threshold)

  // Map: summarise each chunk (sequentially to respect rate limits). Reused for the bible.
  const summaries = []
  for (let i = 0; i < chunks.length; i++) {
    summaries.push(
      await complete({
        system: SUMMARY_SYSTEM,
        user: chunks[i],
        json: false,
        maxTokens: 3000,
      })
    )
  }

  // ── BIBLE pass: one call → shared book-wide fields (no episodes). ───────────
  const overview = summaries
    .map((s, i) => `--- SECTION ${i + 1} ---\n\n${s}`)
    .join('\n\n')

  let bible
  try {
    const bibleRaw = await complete({
      system: buildBiblePrompt(genrePreset, language),
      user: `Here is a faithful, section-by-section overview of the ENTIRE book. Build the series bible (shared fields + full recurring cast) for adapting it:\n\n${overview}`,
      json: true,
      maxTokens: config.managed.seriesMaxTokens,
    })
    bible = parseSeriesJson(bibleRaw)
  } catch (err) {
    console.error('[chunkedText] bible pass failed — falling back to single-reduce:', err?.message || err)
    return reduceFromSummaries({ summaries, genrePreset, language, episodeCount, complete })
  }

  // ── SECTION passes: one call per chunk → episodes for that section. ─────────
  const bibleCharacters = Array.isArray(bible.characters) ? bible.characters : []
  const sectionContext =
    `SERIES BIBLE (stay consistent with this):\n` +
    `Title: ${bible.title || ''}\n` +
    `Logline: ${bible.logline || ''}\n` +
    `Visual style: ${bible.production_guide?.visual_style || ''}\n` +
    `Music direction: ${bible.production_guide?.music_direction || ''}\n` +
    `Established cast (use these ids where they appear):\n` +
    JSON.stringify(bibleCharacters, null, 2)

  const sectionEpisodeGroups = []   // [{ index, episodes }]
  const extraCharacters = []
  const sectionSystem = buildSectionPrompt(genrePreset, language)

  for (let i = 0; i < chunks.length; i++) {
    try {
      const raw = await complete({
        system: sectionSystem,
        user:
          `${sectionContext}\n\n` +
          `Now dramatize SECTION ${i + 1} of ${chunks.length} into episodes from its ACTUAL text below. ` +
          `Cover this whole section in order:\n\n--- SECTION ${i + 1} TEXT ---\n\n${chunks[i]}`,
        json: true,
        maxTokens: config.managed.seriesMaxTokens,
      })
      const parsed = parseSeriesJson(raw)
      const episodes = Array.isArray(parsed.episodes) ? parsed.episodes : []
      if (episodes.length > 0) {
        sectionEpisodeGroups.push({ index: i, episodes })
      } else {
        console.error(`[chunkedText] section ${i + 1} returned no episodes — skipping`)
      }
      if (Array.isArray(parsed.new_characters)) extraCharacters.push(...parsed.new_characters)
    } catch (err) {
      console.error(`[chunkedText] section ${i + 1} failed — skipping:`, err?.message || err)
    }
  }

  // ── Fallback: if EVERY section failed, use the old single-reduce path. ──────
  if (sectionEpisodeGroups.length === 0) {
    console.error('[chunkedText] all sections failed — falling back to single-reduce')
    return reduceFromSummaries({ summaries, genrePreset, language, episodeCount, complete })
  }

  return mergeSeries({ bible, bibleCharacters, extraCharacters, sectionEpisodeGroups })
}

/**
 * Merge the bible + all sections' episodes into one series object matching
 * buildSystemPrompt's schema.
 */
function mergeSeries({ bible, bibleCharacters, extraCharacters, sectionEpisodeGroups }) {
  // Episodes: concat in section order, renumber sequentially 1..N.
  const episodes = []
  const coverage = []
  for (const group of sectionEpisodeGroups) {
    for (const ep of group.episodes) {
      const number = episodes.length + 1
      episodes.push({ ...ep, number })
      coverage.push({
        episode: number,
        book_section: `Section ${group.index + 1}`,
        adapts:
          (ep.title ? `${ep.title} — ` : '') +
          `dramatizes part of section ${group.index + 1} of the book.`,
      })
    }
  }

  // Characters: bible cast unioned with any section-introduced characters.
  // Dedup by id, else by lowercased name; keep bible ids stable / first-wins.
  const characters = []
  const seenIds = new Set()
  const seenNames = new Set()
  for (const c of [...bibleCharacters, ...extraCharacters]) {
    if (!c || typeof c !== 'object') continue
    const id = c.id ? String(c.id) : ''
    const name = c.name ? String(c.name).toLowerCase().trim() : ''
    if (id && seenIds.has(id)) continue
    if (!id && name && seenNames.has(name)) continue
    if (id) seenIds.add(id)
    if (name) seenNames.add(name)
    characters.push(c)
  }

  return {
    title: bible.title,
    author: bible.author,
    logline: bible.logline,
    series_hook: bible.series_hook,
    characters,
    episodes,
    production_guide: bible.production_guide,
    coverage,
    coverage_note: bible.coverage_note,
    virality: bible.virality,
  }
}

/**
 * Fallback: the original summarise→single-reduce behaviour. Used when the bible
 * pass fails or every section call fails, so a large book never hard-fails.
 */
async function reduceFromSummaries({ summaries, genrePreset, language, episodeCount, complete }) {
  const combined = summaries
    .map((s, i) => `--- SECTION ${i + 1} ---\n\n${s}`)
    .join('\n\n')

  const raw = await complete({
    system: buildSystemPrompt(genrePreset, language, episodeCount),
    user: `The following is a faithful, complete, section-by-section summary of an ENTIRE book. Adapt the WHOLE work into the series — cover every section:\n\n${combined}`,
    json: true,
    maxTokens: config.managed.seriesMaxTokens,
  })
  return parseSeriesJson(raw)
}
