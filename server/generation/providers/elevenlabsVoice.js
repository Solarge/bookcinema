const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
export const DEFAULT_VOICE = 'pNInz6obpgDQGcFmaJgB' // narrator
export const DEFAULT_MODEL = 'eleven_multilingual_v2'

export function isConfigured() { return !!process.env.ELEVENLABS_KEY }

export async function generate({ text, voiceId }) {
  const apiKey = process.env.ELEVENLABS_KEY
  if (!apiKey) throw new Error('ElevenLabs is not configured (ELEVENLABS_KEY missing)')
  const vid = voiceId || DEFAULT_VOICE
  let res
  try {
    res = await fetch(`${ELEVEN_URL}/${vid}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: DEFAULT_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true } }),
      signal: AbortSignal.timeout(120000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('ElevenLabs provider timed out (120s)')
    throw err
  }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.detail?.message || `ElevenLabs error ${res.status}`) }
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, mimeType: 'audio/mpeg', ext: 'mp3' }
}
