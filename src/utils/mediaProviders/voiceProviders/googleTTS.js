// Google Cloud TTS — very cheap ($4/1M chars), 380+ voices, 50+ languages
// Docs: https://cloud.google.com/text-to-speech
// Standard voices: free up to 4M chars/month, then $4/1M
// WaveNet voices: $16/1M — higher quality
// Studio voices: $160/1M — premium quality

const GOOGLE_VOICES = [
  { id: 'en-US-Studio-O', label: 'Studio O (Female)', lang: 'en-US' },
  { id: 'en-US-Studio-M', label: 'Studio M (Male)',   lang: 'en-US' },
  { id: 'en-US-Neural2-A', label: 'Neural2 A',        lang: 'en-US' },
  { id: 'en-US-Neural2-D', label: 'Neural2 D',        lang: 'en-US' },
  { id: 'en-GB-Studio-B', label: 'British Male',      lang: 'en-GB' },
  { id: 'en-GB-Studio-C', label: 'British Female',    lang: 'en-GB' },
]

export { GOOGLE_VOICES }

export async function generateVoice({ text, voiceId = 'en-US-Studio-O', apiKey }) {
  const [languageCode] = voiceId.split('-').slice(0, 2).join('-').padEnd(5)
  const lang = voiceId.match(/^([a-z]{2}-[A-Z]{2})/)?.[1] ?? 'en-US'

  const res = await fetch(`/googletts/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: lang, name: voiceId },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Google TTS error ${res.status}`)
  }

  const data = await res.json()
  const binaryStr = atob(data.audioContent)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'audio/mp3' })
  return { audioBlob: blob, audioUrl: URL.createObjectURL(blob) }
}
