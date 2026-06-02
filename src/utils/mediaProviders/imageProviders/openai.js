const ASPECT_MAP = {
  '9:16': '1024x1792',
  '16:9': '1792x1024',
  '1:1':  '1024x1024',
}

export async function generateImage({ prompt, aspectRatio = '9:16', imageQuality = 'hd', apiKey, styleHint = '' }) {
  const fullPrompt = styleHint ? `${prompt}. Style: ${styleHint}` : prompt

  const res = await fetch('/openai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: fullPrompt,
      n: 1,
      size: ASPECT_MAP[aspectRatio] ?? '1024x1792',
      quality: imageQuality === 'standard' ? 'standard' : 'hd',
      response_format: 'url',
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `OpenAI image error ${res.status}`)
  }

  const data = await res.json()
  const url = data.data?.[0]?.url
  if (!url) throw new Error('OpenAI returned no image URL')
  return { url }
}
