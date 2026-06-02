// Luma AI Dream Machine — competitive pricing, excellent quality
// Docs: https://docs.lumalabs.ai/docs/video
// Pricing: ~$0.14/5s (ray-flash), ~$0.35/5s (ray-2)

const MODEL_MAP = {
  standard: 'ray-flash-2',  // $0.14/5s — fast
  hd:       'ray-2',        // $0.35/5s — high quality
  master:   'ray-2',        // same model
}

async function pollGeneration(id, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const res = await fetch(`/lumaai/dream-machine/v1/generations/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const data = await res.json()
    if (data.state === 'completed') return data.assets?.video
    if (data.state === 'failed') throw new Error(data.failure_reason || 'Luma AI generation failed')
  }
  throw new Error('Luma AI generation timed out')
}

const ASPECT_MAP = { '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' }

export async function generateVideo({ prompt, aspectRatio = '9:16', videoQuality = 'hd', apiKey, characterReferenceUrl, styleHint = '', duration = '5' }) {
  const fullPrompt = styleHint ? `${prompt}. ${styleHint}` : prompt

  const body = {
    prompt: fullPrompt,
    model: MODEL_MAP[videoQuality] ?? 'ray-2',
    resolution: videoQuality === 'standard' ? '720p' : '1080p',
    aspect_ratio: ASPECT_MAP[aspectRatio] ?? '9:16',
    duration: `${duration}s`,
    ...(characterReferenceUrl ? { keyframes: { frame0: { type: 'image', url: characterReferenceUrl } } } : {}),
  }

  const res = await fetch('/lumaai/dream-machine/v1/generations/video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail || `Luma AI error ${res.status}`)
  }

  const data = await res.json()
  const url = await pollGeneration(data.id, apiKey)
  if (!url) throw new Error('Luma AI returned no video URL')
  return { url }
}
