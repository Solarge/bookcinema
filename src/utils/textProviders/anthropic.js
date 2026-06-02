import { buildSystemPrompt } from './systemPrompt'

export async function generateSeries(bookText, genrePresetKey, { apiKey }, langCode = 'en') {
  if (!apiKey) throw new Error('Anthropic API key not set. Add it in Settings.')

  const res = await fetch('/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: buildSystemPrompt(genrePresetKey, langCode),
      messages: [{ role: 'user', content: `Here is the book to transform into a cinematic series:\n\n${bookText}` }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Anthropic API error ${res.status}`)
  }

  const data = await res.json()
  return parseJsonResponse(data.content[0].text, data.stop_reason)
}

function parseJsonResponse(raw, stopReason) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    if (stopReason === 'max_tokens') throw new Error('Response cut off — try a shorter book description.')
    throw new Error(`Could not parse response: ${e.message}`)
  }
}
