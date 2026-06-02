// MiniMax (Hailuo) Video — high quality, competitive pricing
// Available via fal.ai (fal-ai/minimax-video-01-live) or direct API
// Direct API: https://api.minimax.io/v1/video_generation

import { fal } from '@fal-ai/client'

const FAL_MODEL = 'fal-ai/minimax-video-01-live'

async function viaFal({ prompt, aspectRatio, characterReferenceUrl, apiKey }) {
  fal.config({ credentials: apiKey })
  const result = await fal.subscribe(FAL_MODEL, {
    input: {
      prompt,
      ...(characterReferenceUrl ? { first_frame_image: characterReferenceUrl } : {}),
    },
    pollInterval: 5000,
    timeout: 300000,
  })
  return result.data?.video?.url
}

async function viaDirect({ prompt, aspectRatio, characterReferenceUrl, apiKey, duration }) {
  const res = await fetch('/minimax/v1/video_generation', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'video-01-live',
      prompt,
      duration: Number.parseInt(duration, 10),
      resolution: '1080p',
      ...(characterReferenceUrl ? { first_frame_image: characterReferenceUrl } : {}),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.base_resp?.status_msg || `MiniMax error ${res.status}`)
  }
  const { task_id } = await res.json()
  return pollDirect(task_id, apiKey)
}

async function pollDirect(taskId, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const res = await fetch(`/minimax/v1/query/video_generation?task_id=${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const data = await res.json()
    if (data.status === 'Success') return data.file_id
    if (data.status === 'Fail') throw new Error('MiniMax generation failed')
  }
  throw new Error('MiniMax generation timed out')
}

export async function generateVideo({ prompt, aspectRatio = '9:16', videoQuality = 'hd', apiKey, characterReferenceUrl, styleHint = '', duration = '5', useFal = true }) {
  const fullPrompt = styleHint ? `${prompt}. ${styleHint}` : prompt

  const url = useFal
    ? await viaFal({ prompt: fullPrompt, aspectRatio, characterReferenceUrl, apiKey })
    : await viaDirect({ prompt: fullPrompt, aspectRatio, characterReferenceUrl, apiKey, duration })

  if (!url) throw new Error('MiniMax returned no video URL')
  return { url }
}
