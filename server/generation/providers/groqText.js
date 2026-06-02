import { buildSystemPrompt } from '../systemPrompt.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export async function generate({ bookText, genrePreset = 'cinematic', language = 'en', model = DEFAULT_MODEL }) {
  // Read from env every call so tests (and runtime key rotation) take effect immediately.
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('Groq is not configured (GROQ_API_KEY missing)')

  const res = await fetch(GROQ_URL, {
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
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Groq API error ${res.status}`)
  }
  const data = await res.json()
  return parseJson(data.choices?.[0]?.message?.content)
}

function parseJson(raw) {
  const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) } catch (e) { throw new Error(`Groq response parse error: ${e.message}`) }
}
