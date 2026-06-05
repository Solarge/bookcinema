import { generateSeriesFromBook } from '../chunkedText.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

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
        max_tokens: maxTokens,
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
