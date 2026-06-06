// Self-hosted "BookFilm Engine" text adapter — OpenAI-compatible LLM (vLLM / Ollama-style) — Phase 1.
// INERT until ENGINE_TEXT_URL is set: isConfigured() returns false, so the
// worker's failover loop skips this provider and behavior is 100% unchanged.
// The engine endpoint must implement the HTTP contract in docs/ENGINE-SETUP.md.

import { generateSeriesFromBook } from '../chunkedText.js'

export const DEFAULT_MODEL = 'llama-3.3-70b'

export function isConfigured() { return !!process.env.ENGINE_TEXT_URL }

function timeoutMs() { return Number(process.env.ENGINE_TIMEOUT_MS) || 600000 }

function authHeaders(extra = {}) {
  const h = { ...extra }
  if (process.env.ENGINE_API_KEY) h.Authorization = `Bearer ${process.env.ENGINE_API_KEY}`
  return h
}

/**
 * Raw LLM call — returns the response text (not parsed).
 * OpenAI-compatible /v1/chat/completions endpoint.
 *
 * @param {object} opts
 * @param {string}  opts.system
 * @param {string}  opts.user
 * @param {string}  [opts.model]
 * @param {number}  [opts.maxTokens=16000]
 * @param {boolean} [opts.json=true]   false → plain text (summary calls)
 */
export async function complete({ system, user, model = DEFAULT_MODEL, maxTokens = 16000, json = true }) {
  const baseUrl = process.env.ENGINE_TEXT_URL
  if (!baseUrl) throw new Error('Engine text is not configured (ENGINE_TEXT_URL missing)')

  let res
  try {
    res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Engine text timed out (${timeoutMs()}ms)`)
    throw err
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Engine text error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  if (!content) throw new Error('Engine text returned an empty response')
  return content
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
