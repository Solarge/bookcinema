// Self-hosted "BookFilm Engine" voice adapter (e.g. XTTS) — Phase 0.
// INERT until ENGINE_VOICE_URL is set: isConfigured() returns false, so the
// worker's failover loop skips this provider and behavior is 100% unchanged.
// The engine endpoint must implement the HTTP contract in docs/ENGINE-SETUP.md.

export const DEFAULT_MODEL = 'xtts-v2'

export function isConfigured() { return !!process.env.ENGINE_VOICE_URL }

const EXT_BY_MIME = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav' }

function timeoutMs() { return Number(process.env.ENGINE_TIMEOUT_MS) || 600000 }

function authHeaders(extra = {}) {
  const h = { ...extra }
  if (process.env.ENGINE_API_KEY) h.Authorization = `Bearer ${process.env.ENGINE_API_KEY}`
  return h
}

export async function generate({ text, voiceId, speakerRef, model }) {
  const baseUrl = process.env.ENGINE_VOICE_URL
  if (!baseUrl) throw new Error('Engine voice is not configured (ENGINE_VOICE_URL missing)')

  let res
  try {
    res = await fetch(`${baseUrl}/generate`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        text,
        voice_id: voiceId || null,
        speaker_ref: speakerRef || null,
        model: model || DEFAULT_MODEL,
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Engine voice timed out (${timeoutMs()}ms)`)
    throw err
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Engine voice error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }

  const contentType = (res.headers?.get?.('content-type') || '').toLowerCase()

  // JSON { url } response — download the bytes.
  if (contentType.includes('application/json')) {
    const data = await res.json()
    const url = data?.url
    if (!url) throw new Error('Engine voice returned JSON without a url')
    let audioRes
    try {
      audioRes = await fetch(url, { signal: AbortSignal.timeout(timeoutMs()) })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Engine voice download timed out (${timeoutMs()}ms)`)
      throw err
    }
    if (!audioRes.ok) throw new Error(`Engine voice download failed ${audioRes.status}`)
    const dlType = (audioRes.headers?.get?.('content-type') || '').toLowerCase()
    const mimeType = EXT_BY_MIME[dlType] ? dlType : 'audio/mpeg'
    return { buffer: Buffer.from(await audioRes.arrayBuffer()), mimeType, ext: EXT_BY_MIME[mimeType] || 'mp3' }
  }

  // Raw audio bytes with a Content-Type header.
  const mimeType = EXT_BY_MIME[contentType] ? contentType : 'audio/mpeg'
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType, ext: EXT_BY_MIME[mimeType] || 'mp3' }
}
