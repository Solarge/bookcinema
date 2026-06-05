// LIVE-VERIFY: This adapter calls fal.ai's text-to-music API (Stability Stable Audio).
// It cannot be tested live without spend. Verify manually with a real FALAI_KEY
// against https://queue.fal.run/fal-ai/stable-audio before deploying to production.
//
// The operator can swap DEFAULT_MODEL for another fal.ai music model (e.g.
// 'fal-ai/minimax-music') if desired. The managed worker fails over to/from
// Replicate MusicGen automatically, so changing the model here is safe.

export const DEFAULT_MODEL = 'fal-ai/stable-audio'

export function isConfigured() { return !!process.env.FALAI_KEY }

// Poll the fal.ai async queue until the job is COMPLETED/FAILED.
// Music generation is moderately slow — allow up to 60 attempts × 5s = ~5 minutes.
async function pollFalQueue(statusUrl, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    let res
    try {
      res = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(30000),
      })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai music poll timed out (30s per attempt)')
      throw err
    }
    if (!res.ok) throw new Error(`fal.ai music poll error ${res.status}`)
    const d = await res.json()
    if (d.status === 'COMPLETED') return d.response_url || d.result?.audio_file?.url || d.result?.audio?.url || null
    if (d.status === 'FAILED') throw new Error(d.error || 'fal.ai music generation failed')
    // statuses: IN_QUEUE, IN_PROGRESS — keep polling
  }
  throw new Error('fal.ai music generation timed out after polling')
}

// Map an audio content-type to { mimeType, ext }. Defaults to mp3.
function detectAudioFormat(contentType) {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('wav') || ct.includes('x-wav')) return { mimeType: 'audio/wav', ext: 'wav' }
  return { mimeType: 'audio/mpeg', ext: 'mp3' }
}

export async function generate({ prompt, duration = 20, model }) {
  const apiKey = process.env.FALAI_KEY
  if (!apiKey) throw new Error('fal.ai is not configured (FALAI_KEY missing)')

  const submitUrl = `https://queue.fal.run/${model || DEFAULT_MODEL}`

  // Submit to fal.ai async queue.
  // Stable Audio uses `seconds_total`; include `duration` too for safety across models.
  let submitRes
  try {
    submitRes = await fetch(submitUrl, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        seconds_total: duration || 20,
        duration: duration || 20,
      }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai music submit timed out (30s)')
    throw err
  }
  const submitData = await submitRes.json()
  if (!submitRes.ok) throw new Error(submitData?.detail || `fal.ai music submit error ${submitRes.status}`)

  // fal.ai async queue returns { request_id, status_url, response_url }
  const statusUrl = submitData.status_url
  if (!statusUrl) throw new Error('fal.ai music submit did not return a status_url')

  // Poll until done
  const audioUrl = await pollFalQueue(statusUrl, apiKey)

  if (!audioUrl) throw new Error('fal.ai music returned no audio URL')

  // Download the audio bytes
  let audioRes
  try {
    audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(120000) })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai music download timed out (120s)')
    throw err
  }
  if (!audioRes.ok) throw new Error(`Music download failed ${audioRes.status}`)
  const { mimeType, ext } = detectAudioFormat(audioRes.headers?.get?.('content-type'))
  return { buffer: Buffer.from(await audioRes.arrayBuffer()), mimeType, ext }
}
