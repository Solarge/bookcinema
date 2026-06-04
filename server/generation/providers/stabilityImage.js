// LIVE-VERIFY: This adapter calls the Stability AI SD3.5 API (multipart/form-data).
// It cannot be tested live without spend. Verify manually with a real STABILITY_API_KEY
// against https://api.stability.ai/v2beta/stable-image/generate/sd3 before
// deploying to production. The API returns raw image bytes (not JSON) when
// Accept: image/* is sent; ensure the response content-type is image/png.

const STABILITY_URL = 'https://api.stability.ai/v2beta/stable-image/generate/sd3'
export const DEFAULT_MODEL = 'sd3.5-large'

// Stability AI aspect_ratio strings accepted by SD3.5
const ASPECT_RATIO_MAP = {
  '9:16': '9:16',
  '16:9': '16:9',
  '1:1':  '1:1',
}

export function isConfigured() { return !!process.env.STABILITY_API_KEY }

export async function generate({ prompt, aspectRatio = '9:16', styleHint = '' }) {
  const apiKey = process.env.STABILITY_API_KEY
  if (!apiKey) throw new Error('Stability AI is not configured (STABILITY_API_KEY missing)')

  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt
  const ar = ASPECT_RATIO_MAP[aspectRatio] || '9:16'

  // SD3.5 expects multipart/form-data
  const form = new FormData()
  form.append('prompt', fullPrompt)
  form.append('aspect_ratio', ar)
  form.append('output_format', 'png')
  form.append('model', DEFAULT_MODEL)

  let res
  try {
    res = await fetch(STABILITY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'image/*',
        // Do NOT set Content-Type; the browser/Node FormData will add the boundary automatically.
      },
      body: form,
      signal: AbortSignal.timeout(120000),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('Stability AI provider timed out (120s)')
    throw err
  }
  if (!res.ok) {
    // On error the API may return JSON
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody?.errors?.[0] || errBody?.message || `Stability AI error ${res.status}`)
  }
  // Success: raw image bytes
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, mimeType: 'image/png', ext: 'png' }
}
