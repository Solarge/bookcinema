// Self-hosted "BookFilm Engine" image adapter — Phase 0.
// INERT until ENGINE_IMAGE_URL is set: isConfigured() returns false, so the
// worker's failover loop skips this provider and behavior is 100% unchanged.
// The engine endpoint must implement the HTTP contract in docs/ENGINE-SETUP.md.

export const DEFAULT_MODEL = 'flux.1-dev'

export function isConfigured() { return !!process.env.ENGINE_IMAGE_URL }

const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' }

function timeoutMs() { return Number(process.env.ENGINE_TIMEOUT_MS) || 600000 }

function authHeaders(extra = {}) {
  const h = { ...extra }
  if (process.env.ENGINE_API_KEY) h.Authorization = `Bearer ${process.env.ENGINE_API_KEY}`
  return h
}

export async function generate({ prompt, aspectRatio = '9:16', imageQuality = 'hd', characterRef, seed, model }) {
  const baseUrl = process.env.ENGINE_IMAGE_URL
  if (!baseUrl) throw new Error('Engine image is not configured (ENGINE_IMAGE_URL missing)')

  let res
  try {
    res = await fetch(`${baseUrl}/generate`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspectRatio,
        quality: imageQuality,
        character_ref: characterRef || null,
        seed: seed ?? null,
        model: model || DEFAULT_MODEL,
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Engine image timed out (${timeoutMs()}ms)`)
    throw err
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Engine image error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }

  const contentType = (res.headers?.get?.('content-type') || '').toLowerCase()

  // JSON { url } response — download the bytes (mirror falaiImage.js).
  if (contentType.includes('application/json')) {
    const data = await res.json()
    const url = data?.url
    if (!url) throw new Error('Engine image returned JSON without a url')
    let imgRes
    try {
      imgRes = await fetch(url, { signal: AbortSignal.timeout(timeoutMs()) })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Engine image download timed out (${timeoutMs()}ms)`)
      throw err
    }
    if (!imgRes.ok) throw new Error(`Engine image download failed ${imgRes.status}`)
    const dlType = (imgRes.headers?.get?.('content-type') || '').toLowerCase()
    const mimeType = EXT_BY_MIME[dlType] ? dlType : 'image/png'
    return { buffer: Buffer.from(await imgRes.arrayBuffer()), mimeType, ext: EXT_BY_MIME[mimeType] || 'png' }
  }

  // Raw image bytes with a Content-Type header.
  const mimeType = EXT_BY_MIME[contentType] ? contentType : 'image/png'
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType, ext: EXT_BY_MIME[mimeType] || 'png' }
}
