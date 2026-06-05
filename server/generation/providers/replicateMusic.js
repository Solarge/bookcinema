// LIVE-VERIFY: This adapter calls Replicate's MusicGen API (meta/musicgen model).
// It cannot be tested live without spend. Verify manually with a real REPLICATE_API_TOKEN
// against https://api.replicate.com/v1/models/meta/musicgen/predictions before deploying
// to production.
//
// NOTE: Replicate's `meta/musicgen` is referenced here via the model-scoped predictions
// endpoint (same convention as replicateVideo's minimax/video-01). If Replicate requires a
// pinned version hash for this model, the operator may need to switch to the
// /v1/predictions endpoint with a `version` field — set the model identifier accordingly.
// The worker already fails a music job gracefully if the provider errors.

const MODEL_URL = 'https://api.replicate.com/v1/models/meta/musicgen/predictions'
export const DEFAULT_MODEL = 'meta/musicgen'

export function isConfigured() { return !!process.env.REPLICATE_API_TOKEN }

// Poll the Replicate prediction until succeeded/failed.
// Music generation is moderately slow — allow up to 60 attempts × 5s = ~5 minutes.
async function pollPrediction(id, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    let res
    try {
      res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30000),
      })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Replicate music poll timed out (30s per attempt)')
      throw err
    }
    if (!res.ok) throw new Error(`Replicate music poll error ${res.status}`)
    const d = await res.json()
    if (d.status === 'succeeded') return Array.isArray(d.output) ? d.output[0] : d.output
    if (d.status === 'failed' || d.status === 'canceled') throw new Error(d.error || 'Replicate music prediction failed')
  }
  throw new Error('Replicate music prediction timed out')
}

// Map an audio content-type to { mimeType, ext }. Defaults to mp3.
function detectAudioFormat(contentType) {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('wav') || ct.includes('x-wav')) return { mimeType: 'audio/wav', ext: 'wav' }
  return { mimeType: 'audio/mpeg', ext: 'mp3' }
}

export async function generate({ prompt, duration = 20, model }) {
  const apiKey = process.env.REPLICATE_API_TOKEN
  if (!apiKey) throw new Error('Replicate is not configured (REPLICATE_API_TOKEN missing)')

  let submitRes
  try {
    submitRes = await fetch(MODEL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          prompt,
          duration: duration || 20,
        },
      }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Replicate music submit timed out (30s)')
    throw err
  }
  const data = await submitRes.json()
  if (!submitRes.ok) throw new Error(data?.detail || `Replicate music error ${submitRes.status}`)

  let url = data.status === 'succeeded' ? (Array.isArray(data.output) ? data.output[0] : data.output) : null
  if (!url && data.id) url = await pollPrediction(data.id, apiKey)
  if (!url) throw new Error('Replicate returned no music URL')

  let audioRes
  try {
    audioRes = await fetch(url, { signal: AbortSignal.timeout(120000) })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Replicate music download timed out (120s)')
    throw err
  }
  if (!audioRes.ok) throw new Error(`Music download failed ${audioRes.status}`)
  const { mimeType, ext } = detectAudioFormat(audioRes.headers?.get?.('content-type'))
  return { buffer: Buffer.from(await audioRes.arrayBuffer()), mimeType, ext }
}
