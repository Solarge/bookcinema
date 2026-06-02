import { buildSystemPrompt } from './systemPrompt'

// Groq — extremely fast inference, generous free tier
// Models: llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768
export async function generateSeries(bookText, genrePresetKey, { apiKey, model = 'llama-3.3-70b-versatile' }, langCode = 'en') {
  if (!apiKey) throw new Error('Groq API key not set. Get one free at console.groq.com')

  const res = await fetch('/groq/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      temperature: 0.7,
      messages: [
        { role: 'system', content: buildSystemPrompt(genrePresetKey, langCode) },
        { role: 'user', content: `Here is the book to transform into a cinematic series:\n\n${bookText}` },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Groq API error ${res.status}`)
  }

  const data = await res.json()
  return parseJson(data.choices[0].message.content)
}

function parseJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) } catch (e) { throw new Error(`Groq response parse error: ${e.message}`) }
}
