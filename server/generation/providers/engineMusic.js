// Self-hosted "BookFilm Engine" music adapter (e.g. MusicGen) — Phase 1.
// INERT until ENGINE_MUSIC_URL is set: isConfigured() returns false, so the
// worker's failover loop skips this provider and behavior is 100% unchanged.
// The engine endpoint must implement the HTTP contract in docs/ENGINE-SETUP.md.

export const DEFAULT_MODEL = 'musicgen'

export function isConfigured() { return !!process.env.ENGINE_MUSIC_URL }

const EXT_BY_MIME = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav' }

function timeoutMs() { return Number(process.env.ENGINE_TIMEOUT_MS) || 600000 }

function authHeaders(extra = {}) {
  const h = { ...extra }
  if (process.env.ENGINE_API_KEY) h.Authorization = `Bearer ${process.env.ENGINE_API_KEY}`
  return h
}

export async function generate({ prompt, duration = 20, model }) {
  const baseUrl = process.env.ENGINE_MUSIC_URL
  if (!baseUrl) throw new Error('Engine music is not configured (ENGINE_MUSIC_URL missing)')

  let res
  try {
    res = await fetch(`${baseUrl}/generate`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        prompt,
        duration,
        model: model || DEFAULT_MODEL,
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Engine music timed out (${timeoutMs()}ms)`)
    throw err
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Engine music error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }

  const contentType = (res.headers?.get?.('content-type') || '').toLowerCase()

  // JSON { url } response — download the bytes.
  if (contentType.includes('application/json')) {
    const data = await res.json()
    const url = data?.url
    if (!url) throw new Error('Engine music returned JSON without a url')
    let audioRes
    try {
      audioRes = await fetch(url, { signal: AbortSignal.timeout(timeoutMs()) })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Engine music download timed out (${timeoutMs()}ms)`)
      throw err
    }
    if (!audioRes.ok) throw new Error(`Engine music download failed ${audioRes.status}`)
    const dlType = (audioRes.headers?.get?.('content-type') || '').toLowerCase()
    const mimeType = EXT_BY_MIME[dlType] ? dlType : 'audio/mpeg'
    return { buffer: Buffer.from(await audioRes.arrayBuffer()), mimeType, ext: EXT_BY_MIME[mimeType] || 'mp3' }
  }

  // Raw audio bytes with a Content-Type header.
  const mimeType = EXT_BY_MIME[contentType] ? contentType : 'audio/mpeg'
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType, ext: EXT_BY_MIME[mimeType] || 'mp3' }
}
