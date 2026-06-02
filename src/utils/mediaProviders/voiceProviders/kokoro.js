// Kokoro TTS — MIT license, runs locally, excellent quality
// GitHub: https://github.com/remsky/Kokoro-FastAPI
// Install: pip install kokoro-fastapi  →  kokoro serve
// Default port: 8880 — OpenAI TTS-compatible API

export const KOKORO_VOICES = [
  { id: 'af_heart',  label: 'Heart (F)',   desc: 'Warm expressive female' },
  { id: 'af_bella',  label: 'Bella (F)',   desc: 'Soft melodic female' },
  { id: 'af_nicole', label: 'Nicole (F)',  desc: 'Natural conversational female' },
  { id: 'am_adam',   label: 'Adam (M)',    desc: 'Deep resonant male' },
  { id: 'am_michael',label: 'Michael (M)', desc: 'Clear articulate male' },
  { id: 'bf_emma',   label: 'Emma (British F)', desc: 'British female' },
  { id: 'bm_george', label: 'George (British M)', desc: 'British male' },
]

export async function generateVoice({ text, voiceId = 'af_heart', baseUrl = 'http://localhost:8880' }) {
  const res = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice: voiceId,
      response_format: 'mp3',
      speed: 1.0,
    }),
  }).catch(() => { throw new Error(`Cannot reach Kokoro TTS at ${baseUrl}. Run: kokoro serve`) })

  if (!res.ok) throw new Error(`Kokoro TTS error ${res.status}`)
  const blob = await res.blob()
  return { audioBlob: blob, audioUrl: URL.createObjectURL(blob) }
}
