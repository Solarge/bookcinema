// Self-hosted "BookFilm Engine" video adapter (text/image-to-video, e.g. Wan2.1) — Phase 1.
// INERT until ENGINE_VIDEO_URL is set: isConfigured() returns false, so the
// worker's failover loop skips this provider and behavior is 100% unchanged.
// The engine endpoint must implement the HTTP contract in docs/ENGINE-SETUP.md.
//
// Unlike falaiVideo/runwayVideo, this adapter passes `duration` straight through
// with NO 5/10s cap — the self-hosted engine supports arbitrary clip length.

export const DEFAULT_MODEL = 'wan2.1'

export function isConfigured() { return !!process.env.ENGINE_VIDEO_URL }

const EXT_BY_MIME = { 'video/mp4': 'mp4', 'video/webm': 'webm' }

function timeoutMs() { return Number(process.env.ENGINE_TIMEOUT_MS) || 600000 }

function authHeaders(extra = {}) {
  const h = { ...extra }
  if (process.env.ENGINE_API_KEY) h.Authorization = `Bearer ${process.env.ENGINE_API_KEY}`
  return h
}

export async function generate({ prompt, aspectRatio = '9:16', duration = 5, characterRef, model }) {
  const baseUrl = process.env.ENGINE_VIDEO_URL
  if (!baseUrl) throw new Error('Engine video is not configured (ENGINE_VIDEO_URL missing)')

  let res
  try {
    res = await fetch(`${baseUrl}/generate`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspectRatio,
        // NO cap — pass the requested duration straight through.
        duration,
        character_ref: characterRef || null,
        model: model || DEFAULT_MODEL,
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Engine video timed out (${timeoutMs()}ms)`)
    throw err
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Engine video error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }

  const contentType = (res.headers?.get?.('content-type') || '').toLowerCase()

  // JSON { url } response — download the bytes.
  if (contentType.includes('application/json')) {
    const data = await res.json()
    const url = data?.url
    if (!url) throw new Error('Engine video returned JSON without a url')
    let vidRes
    try {
      vidRes = await fetch(url, { signal: AbortSignal.timeout(timeoutMs()) })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Engine video download timed out (${timeoutMs()}ms)`)
      throw err
    }
    if (!vidRes.ok) throw new Error(`Engine video download failed ${vidRes.status}`)
    const dlType = (vidRes.headers?.get?.('content-type') || '').toLowerCase()
    const mimeType = EXT_BY_MIME[dlType] ? dlType : 'video/mp4'
    return { buffer: Buffer.from(await vidRes.arrayBuffer()), mimeType, ext: EXT_BY_MIME[mimeType] || 'mp4' }
  }

  // Raw video bytes with a Content-Type header.
  const mimeType = EXT_BY_MIME[contentType] ? contentType : 'video/mp4'
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType, ext: EXT_BY_MIME[mimeType] || 'mp4' }
}
