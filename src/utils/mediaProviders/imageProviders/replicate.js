// Resolution by aspect ratio and quality tier
const DIMENSIONS = {
  '9:16': { standard: { width: 768,  height: 1344 }, hd: { width: 1080, height: 1920 }, ultra: { width: 1440, height: 2560 } },
  '16:9': { standard: { width: 1344, height: 768  }, hd: { width: 1920, height: 1080 }, ultra: { width: 2560, height: 1440 } },
  '1:1':  { standard: { width: 1024, height: 1024 }, hd: { width: 1440, height: 1440 }, ultra: { width: 2048, height: 2048 } },
}

async function pollPrediction(id, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(`/replicate/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const data = await res.json()
    if (data.status === 'succeeded') return data.output?.[0] ?? data.output
    if (data.status === 'failed') throw new Error(data.error || 'Replicate prediction failed')
  }
  throw new Error('Replicate prediction timed out')
}

export async function generateImage({ prompt, aspectRatio = '9:16', imageQuality = 'hd', apiKey, styleHint = '' }) {
  const dims = DIMENSIONS[aspectRatio]?.[imageQuality] ?? DIMENSIONS['9:16'].hd
  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt

  const qualityMap = { ultra: 100, hd: 90, standard: 80 }
  const outputQuality = qualityMap[imageQuality] ?? 90

  const res = await fetch('/replicate/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt: fullPrompt,
        width: dims.width,
        height: dims.height,
        output_format: 'jpg',
        output_quality: outputQuality,
        prompt_upsampling: imageQuality !== 'standard',
      },
    }),
  })

  const data = await res.json()
  if (data.status === 'succeeded') return { url: data.output?.[0] ?? data.output }
  if (data.id) {
    const url = await pollPrediction(data.id, apiKey)
    return { url }
  }
  throw new Error(data.detail || 'Replicate image generation failed')
}
