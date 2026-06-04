// LIVE-VERIFY: This adapter calls the Runway Gen-3 Alpha Turbo text-to-video API.
// It cannot be tested live without spend. Verify manually with a real RUNWAY_API_KEY
// against https://api.dev.runwayml.com/v1/text_to_video before deploying to production.
//
// NOTE on init image: The Gen-3 text_to_video endpoint accepts an optional `promptImage`
// (base64 or URL) as a conditioning frame. This adapter omits it for text-only generation.
// If the product later needs image-conditioned video, add a `promptImage` parameter to
// generate() and include it in the request body.
//
// Runway API versioning: X-Runway-Version header must match the API release date string.
// Update RUNWAY_API_VERSION below if Runway publishes a newer stable version.

const RUNWAY_SUBMIT_URL = 'https://api.dev.runwayml.com/v1/text_to_video'
const RUNWAY_TASK_BASE  = 'https://api.dev.runwayml.com/v1/tasks'
const RUNWAY_API_VERSION = '2024-11-06'
export const DEFAULT_MODEL = 'gen3a_turbo'

export function isConfigured() { return !!process.env.RUNWAY_API_KEY }

// Poll the Runway task until succeeded/failed.
// Video generation is slow — allow up to 100 attempts × 6s = ~10 minutes.
async function pollTask(taskId, apiKey, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 6000))
    let res
    try {
      res = await fetch(`${RUNWAY_TASK_BASE}/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}`, 'X-Runway-Version': RUNWAY_API_VERSION },
        signal: AbortSignal.timeout(30000),
      })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Runway task poll timed out (30s per attempt)')
      throw err
    }
    if (!res.ok) throw new Error(`Runway task poll error ${res.status}`)
    const d = await res.json()
    const status = d.status
    if (status === 'SUCCEEDED') {
      // output is an array of video URLs
      const url = Array.isArray(d.output) ? d.output[0] : d.output
      if (!url) throw new Error('Runway task succeeded but returned no output URL')
      return url
    }
    if (status === 'FAILED') throw new Error(d.failure || d.failureCode || 'Runway task failed')
    // PENDING, RUNNING, THROTTLED — keep polling
  }
  throw new Error('Runway video generation timed out after polling')
}

export async function generate({ prompt, aspectRatio = '9:16', duration = 5 }) {
  const apiKey = process.env.RUNWAY_API_KEY
  if (!apiKey) throw new Error('Runway is not configured (RUNWAY_API_KEY missing)')

  // Runway Gen-3 accepts ratio as a string; map to supported values.
  const ratio = aspectRatio === '16:9' ? '1280:768' : aspectRatio === '9:16' ? '768:1280' : '960:960'

  let submitRes
  try {
    submitRes = await fetch(RUNWAY_SUBMIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': RUNWAY_API_VERSION,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        promptText: prompt,
        ratio,
        duration: duration <= 5 ? 5 : 10, // Gen-3 supports 5 or 10 seconds
      }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Runway video submit timed out (30s)')
    throw err
  }
  const submitData = await submitRes.json()
  if (!submitRes.ok) throw new Error(submitData?.message || submitData?.error || `Runway video submit error ${submitRes.status}`)

  const taskId = submitData.id
  if (!taskId) throw new Error('Runway video submit did not return a task id')

  const videoUrl = await pollTask(taskId, apiKey)

  let videoRes
  try {
    videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(300000) })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Runway video download timed out (300s)')
    throw err
  }
  if (!videoRes.ok) throw new Error(`Runway video download failed ${videoRes.status}`)
  return { buffer: Buffer.from(await videoRes.arrayBuffer()), mimeType: 'video/mp4', ext: 'mp4' }
}
