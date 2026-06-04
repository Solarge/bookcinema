const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize'
export const DEFAULT_MODEL = 'en-US-Neural2-D'

export function isConfigured() { return !!process.env.GOOGLE_TTS_API_KEY }

export async function generate({ text, voiceId }) {
  const apiKey = process.env.GOOGLE_TTS_API_KEY
  if (!apiKey) throw new Error('Google TTS is not configured (GOOGLE_TTS_API_KEY missing)')

  let res
  try {
    res = await fetch(`${GOOGLE_TTS_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'en-US', name: voiceId || DEFAULT_MODEL },
        audioConfig: { audioEncoding: 'MP3' },
      }),
      signal: AbortSignal.timeout(120000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Google TTS provider timed out (120s)')
    throw err
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Google TTS API error ${res.status}`)
  }
  const data = await res.json()
  if (!data.audioContent) throw new Error('Google TTS returned no audioContent')
  const buffer = Buffer.from(data.audioContent, 'base64')
  return { buffer, mimeType: 'audio/mpeg', ext: 'mp3' }
}
