// Stability AI — SD3.5 Large (~$0.065/image), cheaper than DALL-E
// Docs: https://platform.stability.ai/docs/api-reference

const ASPECT_MAP = {
  '9:16': '9:16',
  '16:9': '16:9',
  '1:1':  '1:1',
}

const MODEL_MAP = {
  standard: 'sd3.5-medium',      // $0.035/image
  hd:       'sd3.5-large',       // $0.065/image
  ultra:    'sd3.5-large-turbo', // $0.04/image (faster, slightly lower quality)
}

export async function generateImage({ prompt, aspectRatio = '9:16', imageQuality = 'hd', apiKey, styleHint = '' }) {
  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt
  const model = MODEL_MAP[imageQuality] ?? MODEL_MAP.hd

  const formData = new FormData()
  formData.append('prompt', fullPrompt)
  formData.append('aspect_ratio', ASPECT_MAP[aspectRatio] ?? '9:16')
  formData.append('output_format', 'jpeg')
  formData.append('mode', 'text-to-image')

  const res = await fetch(`/stabilityai/v2beta/stable-image/generate/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'image/*',
    },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.message || `Stability AI error ${res.status}`)
  }

  const blob = await res.blob()
  return { url: URL.createObjectURL(blob) }
}
