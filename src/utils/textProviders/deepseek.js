import { buildSystemPrompt } from './systemPrompt'

// DeepSeek — cheapest frontier model (~$0.07/M input tokens)
// Models: deepseek-chat (V3), deepseek-reasoner (R1)
export async function generateSeries(bookText, genrePresetKey, { apiKey, model = 'deepseek-chat' }, langCode = 'en') {
  if (!apiKey) throw new Error('DeepSeek API key not set. Get one at platform.deepseek.com')

  const res = await fetch('/deepseek/chat/completions', {
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
    throw new Error(err?.error?.message || `DeepSeek API error ${res.status}`)
  }

  const data = await res.json()
  return parseJson(data.choices[0].message.content)
}

function parseJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) } catch (e) { throw new Error(`DeepSeek response parse error: ${e.message}`) }
}
