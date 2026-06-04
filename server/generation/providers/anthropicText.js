import { buildSystemPrompt } from '../systemPrompt.js'
import { parseSeriesJson } from '../parseSeriesJson.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

export async function generate({ bookText, genrePreset = 'cinematic', language = 'en', model = DEFAULT_MODEL }) {
  // Read from env every call so tests (and runtime key rotation) take effect immediately.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic is not configured (ANTHROPIC_API_KEY missing)')

  let res
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 16000,
        system: buildSystemPrompt(genrePreset, language),
        messages: [{ role: 'user', content: `Here is the book to transform into a cinematic series:\n\n${bookText}` }],
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
  return parseSeriesJson(data.content?.[0]?.text, data.stop_reason)
}
