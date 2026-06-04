import { buildSystemPrompt } from '../systemPrompt.js'
import { parseSeriesJson } from '../parseSeriesJson.js'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
export const DEFAULT_MODEL = 'deepseek-chat'

export function isConfigured() { return !!process.env.DEEPSEEK_API_KEY }

export async function generate({ bookText, genrePreset = 'cinematic', language = 'en', model = DEFAULT_MODEL }) {
  // Read from env every call so tests (and runtime key rotation) take effect immediately.
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DeepSeek is not configured (DEEPSEEK_API_KEY missing)')

  let res
  try {
    res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, max_tokens: 8000, temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(genrePreset, language) },
          { role: 'user', content: `Here is the book to transform into a cinematic series:\n\n${bookText}` },
        ],
      }),
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
  return parseSeriesJson(data.choices?.[0]?.message?.content)
}
