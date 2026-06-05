import { generateSeriesFromBook } from '../chunkedText.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

// Anthropic caps output tokens per model. DEFAULT_MODEL (Claude Sonnet 4) supports
// up to 64000 output tokens, so a 32000 series request is well within range. We still
// clamp to a conservative safe maximum so an over-large maxTokens (e.g. if a caller
// overrides the model with one that caps lower) never produces a 400 — callers asking
// for more than the cap silently get the cap instead of an error.
export const MODEL_MAX_OUTPUT = 64000

export function isConfigured() { return !!process.env.ANTHROPIC_API_KEY }

/**
 * Raw LLM call — returns the response text (not parsed).
 *
 * @param {object} opts
 * @param {string}  opts.system
 * @param {string}  opts.user
 * @param {string}  [opts.model]
 * @param {number}  [opts.maxTokens=16000]
 * @param {boolean} [opts.json=true]   false → plain text (summary calls)
 */
export async function complete({ system, user, model = DEFAULT_MODEL, maxTokens = 16000, json = true }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic is not configured (ANTHROPIC_API_KEY missing)')

  // Clamp to the model's safe output ceiling so an over-large request never errors.
  const safeMaxTokens = Math.min(maxTokens, MODEL_MAX_OUTPUT)

  let res
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: safeMaxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(120000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Anthropic provider timed out (120s)')
    throw err
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Anthropic API error ${res.status}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text ?? ''
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
