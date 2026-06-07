// LIVE-VERIFY: This adapter calls fal.ai's video generation API (kling-video model).
// It cannot be tested live without spend. Verify manually with a real FALAI_KEY
// against https://fal.run/fal-ai/kling-video/v1.6/standard/text-to-video before
// deploying to production.

export const DEFAULT_MODEL = 'fal-ai/kling-video/v1.6/standard/text-to-video'
export const PRO_MODEL = 'fal-ai/kling-video/v1.6/pro/text-to-video'

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
    if (d.status === 'COMPLETED') return d   // return the full payload; caller resolves the media URL
    if (d.status === 'FAILED') throw new Error(d.error || 'fal.ai video generation failed')
    // statuses: IN_QUEUE, IN_PROGRESS — keep polling
  }
  throw new Error('fal.ai video generation timed out after polling')
}

export async function generate({ prompt, aspectRatio = '9:16', duration = 5, model }) {
  const apiKey = process.env.FALAI_KEY
  if (!apiKey) throw new Error('fal.ai is not configured (FALAI_KEY missing)')

  const ar = ASPECT_RATIO_MAP[aspectRatio] || '9:16'
  const submitUrl = `https://queue.fal.run/${model || DEFAULT_MODEL}`

  // Submit to fal.ai async queue
  let submitRes
  try {
    submitRes = await fetch(submitUrl, {
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

  // Poll until done — returns the COMPLETED status payload.
  const completed = await pollFalQueue(statusUrl, apiKey)

  // Resolve the actual media URL. The fal queue's `response_url` is the RESULT
  // endpoint (returns JSON, requires the API key) — NOT the video. Fetch it with
  // auth and extract the public media URL. Use an inline result if present.
  let mediaUrl = completed?.result?.video?.url || completed?.video?.url || null
  const responseUrl = completed?.response_url || submitData.response_url
  if (!mediaUrl && responseUrl) {
    let rr
    try {
      rr = await fetch(responseUrl, { headers: { Authorization: `Key ${apiKey}` }, signal: AbortSignal.timeout(30000) })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai video result fetch timed out (30s)')
      throw err
    }
    if (!rr.ok) throw new Error(`fal.ai video result fetch failed ${rr.status}`)
    const rj = await rr.json()
    mediaUrl = rj?.video?.url || rj?.result?.video?.url || rj?.video_url || rj?.url || null
  }
  if (!mediaUrl) throw new Error('fal.ai video: no media URL in completed result')

  // Download the video bytes (fal.media URLs are public; retry with the key on a 401 just in case).
  let videoRes
  try {
    videoRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(300000) })
    if (videoRes.status === 401 || videoRes.status === 403) {
      videoRes = await fetch(mediaUrl, { headers: { Authorization: `Key ${apiKey}` }, signal: AbortSignal.timeout(300000) })
    }
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai video download timed out (300s)')
    throw err
  }
  if (!videoRes.ok) throw new Error(`Video download failed ${videoRes.status}`)
  return { buffer: Buffer.from(await videoRes.arrayBuffer()), mimeType: 'video/mp4', ext: 'mp4' }
}
