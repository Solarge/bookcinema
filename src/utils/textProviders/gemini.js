import { buildSystemPrompt } from './systemPrompt'

// Google Gemini — free tier (15 req/min), competitive pricing
// Models: gemini-2.0-flash (free), gemini-1.5-pro, gemini-2.0-flash-thinking
// Google renames/retires model aliases regularly, so a configured model can start
// returning 404. We self-heal: on a 404 we list the key's available models and retry
// with a valid generateContent-capable one (preferring a "flash" model).
export async function generateSeries(bookText, genrePresetKey, { apiKey, model = 'gemini-2.5-flash' }, langCode = 'en') {
  if (!apiKey) throw new Error('Gemini API key not set. Get one free at aistudio.google.com')

  const systemPrompt = buildSystemPrompt(genrePresetKey, langCode)
  const userText = `Here is the book to transform into a cinematic series:\n\n${bookText}`

  try {
    return await callGemini(model, apiKey, systemPrompt, userText)
  } catch (e) {
    if (e.status !== 404) throw e
    // Model not found for this key/API version — discover a valid one and retry once.
    const fallback = await pickAvailableModel(apiKey, model)
    if (!fallback) {
      throw new Error(`Gemini model "${model}" is not available for your API key, and no compatible model was found. Check aistudio.google.com for an active model name and set it in Settings.`)
    }
    return await callGemini(fallback, apiKey, systemPrompt, userText)
  }
}

async function callGemini(model, apiKey, systemPrompt, userText) {
  const res = await fetch(`/gemini/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userText }] }],
      generationConfig: {
        // A full 7-episode series JSON is large and token-dense; give plenty of headroom.
        // Clamped to the model's max automatically (2.5 models allow far more than 2.0/1.5).
        maxOutputTokens: 65536,
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const error = new Error(err?.error?.message || `Gemini API error ${res.status}`)
    error.status = res.status
    throw error
  }

  const data = await res.json()
  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text ?? ''
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error(`Gemini response was cut off (hit the model's output limit on "${model}"). Use a Gemini 2.5 model (longer output) in Settings, or shorten the input book text.`)
  }
  return parseJson(text)
}

// List the models this key can use and choose a generateContent-capable one.
// Prefers a non-experimental "flash" model, then any flash, then any usable model.
async function pickAvailableModel(apiKey, exclude) {
  const res = await fetch(`/gemini/v1beta/models?key=${apiKey}`)
  if (!res.ok) return null
  const data = await res.json().catch(() => ({}))
  const usable = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => (m.name || '').replace(/^models\//, ''))
    .filter(name => name && name !== exclude)
  if (!usable.length) return null
  const score = (name) => {
    let s = 0
    if (name.includes('flash')) s += 4
    if (!/exp|preview|thinking|vision|tts|embedding|image/i.test(name)) s += 2
    // Prefer newer versions — they allow much larger output (needed for the full series JSON).
    const ver = Number.parseFloat((name.match(/(\d+\.\d+)/) || [])[1] || '0')
    s += ver // e.g. 2.5 > 2.0 > 1.5
    return s
  }
  return usable.sort((a, b) => score(b) - score(a))[0]
}

function parseJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) } catch (e) { throw new Error(`Gemini response parse error: ${e.message}`) }
}
