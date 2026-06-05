import { generateSeriesFromBook } from '../chunkedText.js'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
export const DEFAULT_MODEL = 'deepseek-chat'

export function isConfigured() { return !!process.env.DEEPSEEK_API_KEY }

/**
 * Raw LLM call — returns the response text (not parsed).
 *
 * @param {object} opts
 * @param {string}  opts.system
 * @param {string}  opts.user
 * @param {string}  [opts.model]
 * @param {number}  [opts.maxTokens=8000]
 * @param {boolean} [opts.json=true]   false → plain text (summary calls)
 */
export async function complete({ system, user, model = DEFAULT_MODEL, maxTokens = 8000, json = true }) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DeepSeek is not configured (DEEPSEEK_API_KEY missing)')

  let res
  try {
    const body = {
      model,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }
    if (json) body.response_format = { type: 'json_object' }

    res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('DeepSeek provider timed out (120s)')
    throw err
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `DeepSeek API error ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
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
