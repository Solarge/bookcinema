import { buildSystemPrompt } from './systemPrompt'

// Google Gemini — free tier (15 req/min), competitive pricing
// Models: gemini-2.0-flash (free), gemini-1.5-pro, gemini-2.0-flash-thinking
export async function generateSeries(bookText, genrePresetKey, { apiKey, model = 'gemini-2.0-flash' }, langCode = 'en') {
  if (!apiKey) throw new Error('Gemini API key not set. Get one free at aistudio.google.com')

  const res = await fetch(`/gemini/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: buildSystemPrompt(genrePresetKey, langCode) }] },
      contents: [{
        parts: [{ text: `Here is the book to transform into a cinematic series:\n\n${bookText}` }],
      }],
      generationConfig: {
        maxOutputTokens: 8000,
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return parseJson(text)
}

function parseJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) } catch (e) { throw new Error(`Gemini response parse error: ${e.message}`) }
}
