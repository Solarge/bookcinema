const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech'
export const DEFAULT_MODEL = 'tts-1'

export function isConfigured() { return !!process.env.OPENAI_API_KEY }

export async function generate({ text, voiceId = 'nova', model = DEFAULT_MODEL }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI is not configured (OPENAI_API_KEY missing)')
  let res
  try {
    res = await fetch(OPENAI_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: text, voice: voiceId || 'nova', response_format: 'mp3' }),
      signal: AbortSignal.timeout(120000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('OpenAI TTS provider timed out (120s)')
    throw err
  }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(`OpenAI TTS ${res.status}: ${err?.error?.message || 'request failed'}`) }
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, mimeType: 'audio/mpeg', ext: 'mp3' }
}
