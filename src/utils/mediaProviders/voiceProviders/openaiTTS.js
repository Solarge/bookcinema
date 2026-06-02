// OpenAI TTS — much cheaper than ElevenLabs ($0.015/1K chars vs $0.30/1K)
// Models: tts-1 (fast), tts-1-hd (higher quality)
// Voices: alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer

export const OPENAI_VOICES = [
  { id: 'nova',    label: 'Nova',    desc: 'Warm, natural female' },
  { id: 'alloy',   label: 'Alloy',   desc: 'Neutral, balanced' },
  { id: 'echo',    label: 'Echo',    desc: 'Deep male' },
  { id: 'fable',   label: 'Fable',   desc: 'Expressive British male' },
  { id: 'onyx',    label: 'Onyx',    desc: 'Deep authoritative male' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Expressive female' },
  { id: 'coral',   label: 'Coral',   desc: 'Clear articulate female' },
  { id: 'sage',    label: 'Sage',    desc: 'Wise warm female' },
  { id: 'ash',     label: 'Ash',     desc: 'Calm balanced male' },
]

export async function generateVoice({ text, voiceId = 'nova', apiKey, imageQuality }) {
  const model = imageQuality === 'hd' ? 'tts-1-hd' : 'tts-1'

  const res = await fetch('/openai/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice: voiceId || 'nova',
      response_format: 'mp3',
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenAI TTS error ${res.status}`)
  }

  const blob = await res.blob()
  return { audioBlob: blob, audioUrl: URL.createObjectURL(blob) }
}
