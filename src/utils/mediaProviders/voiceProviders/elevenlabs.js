// Default voice IDs from ElevenLabs public library
export const DEFAULT_VOICES = {
  male_deep:    '29vD33N1CtxCmqQRPOHJ',
  male_warm:    'TxGEqnHWrfWFTfGW9XjX',
  female_soft:  'EXAVITQu4vr4xnSDxMaL',
  female_strong:'21m00Tcm4TlvDq8ikWAM',
  narrator:     'pNInz6obpgDQGcFmaJgB',
}

export async function generateVoice({ text, voiceId, apiKey, stability = 0.5, similarityBoost = 0.75, style = 0 }) {
  const vid = voiceId || DEFAULT_VOICES.narrator

  const res = await fetch(`/elevenlabs/v1/text-to-speech/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability, similarity_boost: similarityBoost, style, use_speaker_boost: true },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail?.message || `ElevenLabs error ${res.status}`)
  }

  const blob = await res.blob()
  return { audioBlob: blob, audioUrl: URL.createObjectURL(blob) }
}

export async function cloneVoice({ name, description = '', audioFile, apiKey }) {
  const formData = new FormData()
  formData.append('name', name)
  formData.append('description', description)
  formData.append('files', audioFile)
  formData.append('remove_background_noise', 'true')

  const res = await fetch('/elevenlabs/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail?.message || `ElevenLabs clone error ${res.status}`)
  }

  const data = await res.json()
  return { voiceId: data.voice_id }
}

export async function listVoices(apiKey) {
  const res = await fetch('/elevenlabs/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  })
  const data = await res.json()
  return data.voices ?? []
}
