import { buildSystemPrompt } from '../systemPrompt.js'
import { parseSeriesJson } from '../parseSeriesJson.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
export const DEFAULT_MODEL = 'gemini-2.5-flash'

export function isConfigured() { return !!process.env.GEMINI_API_KEY }

export async function generate({ bookText, genrePreset = 'cinematic', language = 'en', model = DEFAULT_MODEL }) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini is not configured (GEMINI_API_KEY missing)')

  const systemPrompt = buildSystemPrompt(genrePreset, language)
  const userText = `Here is the book to transform into a cinematic series:\n\n${bookText}`

  let res
  try {
    res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userText }] }],
        generationConfig: {
          maxOutputTokens: 65536,
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(180000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Gemini provider timed out (180s)')
    throw err
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`)
  }

  const data = await res.json()
  const candidate = data.candidates?.[0]
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response was cut off (hit the model\'s output limit). Try a shorter book text.')
  }
  const text = candidate?.content?.parts?.[0]?.text ?? ''
  return parseSeriesJson(text)
}
