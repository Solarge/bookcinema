import { buildSystemPrompt } from './systemPrompt'

// Ollama — 100% local, zero cost, OpenAI-compatible API
// Install: https://ollama.com  — then: ollama pull llama3.1
// Models: llama3.1, llama3.2, mistral, gemma3, qwen2.5, phi4
export async function generateSeries(bookText, genrePresetKey, { baseUrl = 'http://localhost:11434', model = 'llama3.1' }, langCode = 'en') {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.7,
      messages: [
        { role: 'system', content: buildSystemPrompt(genrePresetKey, langCode) },
        { role: 'user', content: `Here is the book to transform into a cinematic series:\n\n${bookText}` },
      ],
      options: { num_predict: 8000 },
    }),
  }).catch(() => { throw new Error(`Cannot reach Ollama at ${baseUrl}. Is it running? Try: ollama serve`) })

  if (!res.ok) throw new Error(`Ollama error ${res.status}. Is model "${model}" pulled? Run: ollama pull ${model}`)

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''
  return parseJson(raw)
}

function parseJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  // Find first { ... } block in case model outputs extra text
  const match = cleaned.match(/\{[\s\S]*\}/)
  try { return JSON.parse(match ? match[0] : cleaned) } catch (e) { throw new Error(`Ollama response parse error: ${e.message}`) }
}
