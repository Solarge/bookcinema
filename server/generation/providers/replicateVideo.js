// LIVE-VERIFY: This adapter calls Replicate's video generation API (minimax/video-01 model).
// It cannot be tested live without spend. Verify manually with a real REPLICATE_API_TOKEN
// against https://api.replicate.com/v1/models/minimax/video-01/predictions before
// deploying to production.

const MODEL_URL = 'https://api.replicate.com/v1/models/minimax/video-01/predictions'
export const DEFAULT_MODEL = 'minimax/video-01'

// Poll the Replicate prediction until succeeded/failed.
// Video is slow — allow up to 80 attempts × 6s = ~8 minutes.
async function pollPrediction(id, apiKey, maxAttempts = 80) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 6000))
    let res
    try {
      res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30000),
      })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Replicate video poll timed out (30s per attempt)')
      throw err
    }
    if (!res.ok) throw new Error(`Replicate video poll error ${res.status}`)
    const d = await res.json()
    if (d.status === 'succeeded') return Array.isArray(d.output) ? d.output[0] : d.output
    if (d.status === 'failed' || d.status === 'canceled') throw new Error(d.error || 'Replicate video prediction failed')
  }
  throw new Error('Replicate video prediction timed out')
}

export async function generate({ prompt, aspectRatio = '9:16', duration = 5 }) {
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
          duration: duration || 5,
          aspect_ratio: aspectRatio === '9:16' ? 'portrait' : aspectRatio === '16:9' ? 'landscape' : 'square',
        },
      }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Replicate video submit timed out (30s)')
    throw err
  }
  const data = await submitRes.json()
  if (!submitRes.ok) throw new Error(data?.detail || `Replicate video error ${submitRes.status}`)

  let url = data.status === 'succeeded' ? (Array.isArray(data.output) ? data.output[0] : data.output) : null
  if (!url && data.id) url = await pollPrediction(data.id, apiKey)
  if (!url) throw new Error('Replicate returned no video URL')

  let videoRes
  try {
    videoRes = await fetch(url, { signal: AbortSignal.timeout(300000) })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Replicate video download timed out (300s)')
    throw err
  }
  if (!videoRes.ok) throw new Error(`Video download failed ${videoRes.status}`)
  return { buffer: Buffer.from(await videoRes.arrayBuffer()), mimeType: 'video/mp4', ext: 'mp4' }
}
