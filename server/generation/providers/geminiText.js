import { generateSeriesFromBook } from '../chunkedText.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
export const DEFAULT_MODEL = 'gemini-2.5-flash'
// Fallback model used when the primary returns a 404 (model not available in this region/key)
const FALLBACK_MODEL = 'gemini-1.5-pro'

export function isConfigured() { return !!process.env.GEMINI_API_KEY }

/**
 * Raw LLM call — returns the response text (not parsed).
 * Preserves the 404 self-heal (retries with FALLBACK_MODEL on model-not-found).
 * When json=true  → sets responseMimeType:'application/json' (series call).
 * When json=false → no responseMimeType (summary call, plain prose).
 *
 * @param {object} opts
 * @param {string}  opts.system
 * @param {string}  opts.user
 * @param {string}  [opts.model]
 * @param {number}  [opts.maxTokens=65536]
 * @param {boolean} [opts.json=true]
 */
export async function complete({ system, user, model = DEFAULT_MODEL, maxTokens = 65536, json = true }) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini is not configured (GEMINI_API_KEY missing)')

  const generationConfig = { maxOutputTokens: maxTokens, temperature: 0.7 }
  if (json) generationConfig.responseMimeType = 'application/json'

  const buildBody = () => JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: [{ parts: [{ text: user }] }],
    generationConfig,
  })

  let res
  let usedModel = model
  try {
    res = await fetch(`${GEMINI_BASE}/${usedModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildBody(),
      signal: AbortSignal.timeout(180000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Gemini provider timed out (180s)')
    throw err
  }

  // 404 self-heal: model not available in this region/key → retry with fallback model
  if (res.status === 404 && usedModel !== FALLBACK_MODEL) {
    usedModel = FALLBACK_MODEL
    try {
      res = await fetch(`${GEMINI_BASE}/${usedModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildBody(),
        signal: AbortSignal.timeout(180000),
      })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Gemini provider timed out (180s)')
      throw err
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }

  const data = await res.json()
  const candidate = data.candidates?.[0]
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response was cut off (hit the model\'s output limit). Try a shorter book text.')
  }
  return candidate?.content?.parts?.[0]?.text ?? ''
}

/**
 * Generate a full series from book text.
 * Delegates to generateSeriesFromBook (single-pass for short books, map-reduce for large).
 * Interface unchanged for the failover worker.
 */
export async function generate({ bookText, genrePreset = 'cinematic', language = 'en', episodeCount = 7, model = DEFAULT_MODEL }) {
  return generateSeriesFromBook({
    bookText, genrePreset, language, episodeCount,
    complete: (args) => complete({ ...args, model: args.model ?? model }),
  })
}
