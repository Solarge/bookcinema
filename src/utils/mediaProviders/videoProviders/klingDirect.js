// Kling AI Direct — no fal.ai middleman markup
// Sign up: https://klingai.com/dev
// Pricing: ~$0.14/5s (standard) to ~$0.28/5s (pro)

const MODEL_MAP = {
  standard: { model: 'kling-v1',   mode: 'std' },
  hd:       { model: 'kling-v1-5', mode: 'pro' },
  master:   { model: 'kling-v2',   mode: 'pro' },
}

async function pollTask(taskId, apiKey, maxAttempts = 72) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const res = await fetch(`/klingdirect/v1/videos/text2video/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const data = await res.json()
    const task = data?.data
    if (task?.task_status === 'succeed') return task.task_result?.videos?.[0]?.url
    if (task?.task_status === 'failed') throw new Error(task.task_status_msg || 'Kling generation failed')
  }
  throw new Error('Kling Direct generation timed out')
}

export async function generateVideo({ prompt, aspectRatio = '9:16', videoQuality = 'hd', apiKey, characterReferenceUrl, styleHint = '', duration = '5' }) {
  const fullPrompt = styleHint ? `${prompt}. ${styleHint}` : prompt
  const { model, mode } = MODEL_MAP[videoQuality] ?? MODEL_MAP.hd

  const body = {
    model_name: model,
    mode,
    prompt: fullPrompt,
    duration: Number.parseInt(duration, 10),
    aspect_ratio: aspectRatio,
    ...(characterReferenceUrl ? { image_url: characterReferenceUrl } : {}),
  }

  const res = await fetch('/klingdirect/v1/videos/text2video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.message || `Kling Direct error ${res.status}`)
  }

  const data = await res.json()
  const url = await pollTask(data.data?.task_id, apiKey)
  if (!url) throw new Error('Kling Direct returned no video URL')
  return { url }
}
