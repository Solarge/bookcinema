// LIVE-VERIFY: This adapter calls fal.ai's video generation API (kling-video model).
// It cannot be tested live without spend. Verify manually with a real FALAI_KEY
// against https://fal.run/fal-ai/kling-video/v1.6/standard/text-to-video before
// deploying to production.

const SUBMIT_URL = 'https://queue.fal.run/fal-ai/kling-video/v1.6/standard/text-to-video'
export const DEFAULT_MODEL = 'fal-ai/kling-video/v1.6/standard/text-to-video'

export function isConfigured() { return !!process.env.FALAI_KEY }

const ASPECT_RATIO_MAP = { '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' }

// Poll the fal.ai async queue until the job is succeeded/failed.
// Video generation is slow — allow up to 100 attempts × 5s = ~8 minutes.
async function pollFalQueue(statusUrl, apiKey, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    let res
    try {
      res = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(30000),
      })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai video poll timed out (30s per attempt)')
      throw err
    }
    if (!res.ok) throw new Error(`fal.ai video poll error ${res.status}`)
    const d = await res.json()
    if (d.status === 'COMPLETED') return d.response_url || d.result?.video?.url || null
    if (d.status === 'FAILED') throw new Error(d.error || 'fal.ai video generation failed')
    // statuses: IN_QUEUE, IN_PROGRESS — keep polling
  }
  throw new Error('fal.ai video generation timed out after polling')
}

export async function generate({ prompt, aspectRatio = '9:16', duration = 5 }) {
  const apiKey = process.env.FALAI_KEY
  if (!apiKey) throw new Error('fal.ai is not configured (FALAI_KEY missing)')

  const ar = ASPECT_RATIO_MAP[aspectRatio] || '9:16'

  // Submit to fal.ai async queue
  let submitRes
  try {
    submitRes = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        aspect_ratio: ar,
        duration: String(duration || 5),
      }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai video submit timed out (30s)')
    throw err
  }
  const submitData = await submitRes.json()
  if (!submitRes.ok) throw new Error(submitData?.detail || `fal.ai video submit error ${submitRes.status}`)

  // fal.ai async queue returns { request_id, status_url, response_url }
  const statusUrl = submitData.status_url
  if (!statusUrl) throw new Error('fal.ai video submit did not return a status_url')

  // Poll until done
  const videoUrl = await pollFalQueue(statusUrl, apiKey)

  if (!videoUrl) throw new Error('fal.ai video returned no video URL')

  // Download the video bytes
  let videoRes
  try {
    videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(300000) })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai video download timed out (300s)')
    throw err
  }
  if (!videoRes.ok) throw new Error(`Video download failed ${videoRes.status}`)
  return { buffer: Buffer.from(await videoRes.arrayBuffer()), mimeType: 'video/mp4', ext: 'mp4' }
}
