import { buildSystemPrompt } from '../systemPrompt.js'
import { parseSeriesJson } from '../parseSeriesJson.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export function isConfigured() { return !!process.env.GROQ_API_KEY }

export async function generate({ bookText, genrePreset = 'cinematic', language = 'en', episodeCount = 7, model = DEFAULT_MODEL }) {
  // Read from env every call so tests (and runtime key rotation) take effect immediately.
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('Groq is not configured (GROQ_API_KEY missing)')

  let res
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, max_tokens: 8000, temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(genrePreset, language, episodeCount) },
          { role: 'user', content: `Here is the book to transform into a cinematic series:\n\n${bookText}` },
        ],
      }),
      signal: AbortSignal.timeout(120000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Groq provider timed out (120s)')
    throw err
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Groq API error ${res.status}`)
  }
  const data = await res.json()
  return parseSeriesJson(data.choices?.[0]?.message?.content)
}
