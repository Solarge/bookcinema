// XTTS-v2 — Coqui TTS, multilingual, voice cloning from sample
// GitHub: https://github.com/coqui-ai/TTS
// Install: pip install TTS  →  tts-server --model tts_models/multilingual/multi-dataset/xtts_v2
// Default port: 8020
// Supports: voice cloning with 6-second sample audio

export async function generateVoice({ text, voiceId, baseUrl = 'http://localhost:8020', speakerWav }) {
  const body = {
    text,
    language: 'en',
    ...(speakerWav ? { speaker_wav: speakerWav } : {}),
    ...(voiceId && !speakerWav ? { speaker: voiceId } : {}),
  }

  const res = await fetch(`${baseUrl}/tts_to_audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => { throw new Error(`Cannot reach XTTS-v2 at ${baseUrl}. Run: tts-server --model xtts_v2`) })

  if (!res.ok) throw new Error(`XTTS-v2 error ${res.status}`)
  const blob = await res.blob()
  return { audioBlob: blob, audioUrl: URL.createObjectURL(blob) }
}

export async function cloneVoice({ name, audioFile, baseUrl = 'http://localhost:8020' }) {
  const formData = new FormData()
  formData.append('name', name)
  formData.append('file', audioFile)

  const res = await fetch(`${baseUrl}/clone_speaker`, {
    method: 'POST',
    body: formData,
  }).catch(() => { throw new Error(`Cannot reach XTTS-v2 at ${baseUrl}`) })

  if (!res.ok) throw new Error(`XTTS clone error ${res.status}`)
  const data = await res.json()
  return { voiceId: data.speaker_id || name }
}
