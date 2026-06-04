const FAL_URL = 'https://fal.run/fal-ai/flux-pro/v1.1'
export const DEFAULT_MODEL = 'fal-ai/flux-pro/v1.1'
const IMAGE_SIZE = { '9:16': 'portrait_16_9', '16:9': 'landscape_16_9', '1:1': 'square_hd' }

export function isConfigured() { return !!process.env.FALAI_KEY }

export async function generate({ prompt, aspectRatio = '9:16', styleHint = '' }) {
  const apiKey = process.env.FALAI_KEY
  if (!apiKey) throw new Error('fal.ai is not configured (FALAI_KEY missing)')
  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt
  let res
  try {
    res = await fetch(FAL_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: fullPrompt, image_size: IMAGE_SIZE[aspectRatio] || 'portrait_16_9' }),
      signal: AbortSignal.timeout(180000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai provider timed out (180s)')
    throw err
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data?.detail || `fal.ai error ${res.status}`)
  const url = data.images?.[0]?.url
  if (!url) throw new Error('fal.ai returned no image URL')
  let imgRes
  try {
    imgRes = await fetch(url, { signal: AbortSignal.timeout(60000) })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('fal.ai image download timed out (60s)')
    throw err
  }
  if (!imgRes.ok) throw new Error(`Image download failed ${imgRes.status}`)
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), mimeType: 'image/jpeg', ext: 'jpg' }
}
