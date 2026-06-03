const MODEL_URL = 'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions'
export const DEFAULT_MODEL = 'black-forest-labs/flux-1.1-pro'
const DIMENSIONS = { '9:16': { width: 1080, height: 1920 }, '16:9': { width: 1920, height: 1080 }, '1:1': { width: 1024, height: 1024 } }

async function pollPrediction(id, apiKey, maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) throw new Error(`Replicate poll error ${res.status}`)
    const d = await res.json()
    if (d.status === 'succeeded') return d.output?.[0] ?? d.output
    if (d.status === 'failed' || d.status === 'canceled') throw new Error(d.error || 'Replicate prediction failed')
  }
  throw new Error('Replicate prediction timed out')
}

export async function generate({ prompt, aspectRatio = '9:16', styleHint = '' }) {
  const apiKey = process.env.REPLICATE_API_TOKEN
  if (!apiKey) throw new Error('Replicate is not configured (REPLICATE_API_TOKEN missing)')
  const dims = DIMENSIONS[aspectRatio] || DIMENSIONS['9:16']
  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt
  const res = await fetch(MODEL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Prefer: 'wait' },
    body: JSON.stringify({ input: { prompt: fullPrompt, width: dims.width, height: dims.height, output_format: 'jpg', output_quality: 90 } }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.detail || `Replicate error ${res.status}`)
  let url = data.status === 'succeeded' ? (data.output?.[0] ?? data.output) : null
  if (!url && data.id) url = await pollPrediction(data.id, apiKey)
  if (!url) throw new Error('Replicate returned no image URL')
  const imgRes = await fetch(url)
  if (!imgRes.ok) throw new Error(`Image download failed ${imgRes.status}`)
  return { buffer: Buffer.from(await imgRes.arrayBuffer()), mimeType: 'image/jpeg', ext: 'jpg' }
}
