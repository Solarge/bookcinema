// LIVE-VERIFY: This adapter calls the Luma Dream Machine API (dream-machine/v1/generations).
// It cannot be tested live without spend. Verify manually with a real LUMA_API_KEY
// against https://api.lumalabs.ai/dream-machine/v1/generations before deploying to production.
//
// NOTE: Luma supports image-conditioned generation via `keyframes`. This adapter
// uses text-only (no keyframe) generation. The `aspect_ratio` field accepts strings
// like "9:16", "16:9", "1:1" directly — matching our internal convention.

const LUMA_GENERATIONS_URL = 'https://api.lumalabs.ai/dream-machine/v1/generations'
export const DEFAULT_MODEL = 'dream-machine'

export function isConfigured() { return !!process.env.LUMA_API_KEY }

// Poll the Luma generation by id until state 'completed'/'failed'.
// Video generation is slow — allow up to 100 attempts × 5s = ~8 minutes.
async function pollGeneration(id, apiKey, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    let res
    try {
      res = await fetch(`${LUMA_GENERATIONS_URL}/${id}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Luma generation poll timed out (30s per attempt)')
      throw err
    }
    if (!res.ok) throw new Error(`Luma generation poll error ${res.status}`)
    const d = await res.json()
    if (d.state === 'completed') {
      const url = d.assets?.video
      if (!url) throw new Error('Luma generation completed but returned no video URL')
      return url
    }
    if (d.state === 'failed') throw new Error(d.failure_reason || 'Luma generation failed')
    // states: queued, dreaming — keep polling
  }
  throw new Error('Luma video generation timed out after polling')
}

export async function generate({ prompt, aspectRatio = '9:16', duration = 5 }) {
  const apiKey = process.env.LUMA_API_KEY
  if (!apiKey) throw new Error('Luma is not configured (LUMA_API_KEY missing)')

  // Luma accepts aspect_ratio strings matching our internal convention directly.
  const ar = ['9:16', '16:9', '1:1'].includes(aspectRatio) ? aspectRatio : '9:16'

  let submitRes
  try {
    submitRes = await fetch(LUMA_GENERATIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: ar,
        loop: false,
      }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Luma video submit timed out (30s)')
    throw err
  }
  const submitData = await submitRes.json()
  if (!submitRes.ok) throw new Error(submitData?.detail || submitData?.message || `Luma video submit error ${submitRes.status}`)

  const id = submitData.id
  if (!id) throw new Error('Luma video submit did not return a generation id')

  const videoUrl = await pollGeneration(id, apiKey)

  let videoRes
  try {
    videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(300000) })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Luma video download timed out (300s)')
    throw err
  }
  if (!videoRes.ok) throw new Error(`Luma video download failed ${videoRes.status}`)
  return { buffer: Buffer.from(await videoRes.arrayBuffer()), mimeType: 'video/mp4', ext: 'mp4' }
}
