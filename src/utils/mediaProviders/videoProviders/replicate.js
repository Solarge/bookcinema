async function pollPrediction(id, apiKey, maxAttempts = 72) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const res = await fetch(`/replicate/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const data = await res.json()
    if (data.status === 'succeeded') return data.output
    if (data.status === 'failed') throw new Error(data.error || 'Replicate prediction failed')
  }
  throw new Error('Replicate video prediction timed out')
}

// Kling v2 on Replicate supports resolution parameter
const RESOLUTION_MAP = {
  standard: '720p',
  hd:       '1080p',
  master:   '1080p',  // Replicate's Kling caps at 1080p
}

export async function generateVideo({
  prompt,
  aspectRatio = '9:16',
  videoQuality = 'hd',
  apiKey,
  characterReferenceUrl,
  styleHint = '',
  duration = '5',
}) {
  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt

  const res = await fetch('/replicate/v1/models/kwaivgi/kling-v2.0/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        prompt: fullPrompt,
        aspect_ratio: aspectRatio,
        duration: Number.parseInt(duration, 10),
        cfg_scale: 0.5,
        resolution: RESOLUTION_MAP[videoQuality] ?? '1080p',
        ...(characterReferenceUrl ? { start_image: characterReferenceUrl } : {}),
      },
    }),
  })

  const data = await res.json()
  if (data.status === 'succeeded') return { url: data.output }
  if (data.id) {
    const url = await pollPrediction(data.id, apiKey)
    return { url }
  }
  throw new Error(data.detail || 'Replicate video generation failed')
}
