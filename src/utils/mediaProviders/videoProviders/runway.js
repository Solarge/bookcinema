// Resolution by aspect ratio and quality tier
const RESOLUTIONS = {
  '9:16':  { standard: '720:1280',  hd: '1080:1920', master: '1080:1920' },
  '16:9':  { standard: '1280:720',  hd: '1920:1080', master: '1920:1080' },
  '1:1':   { standard: '960:960',   hd: '1080:1080', master: '1080:1080' },
}

async function pollTask(taskId, apiKey, maxAttempts = 72) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const res = await fetch(`/runway/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
    })
    const data = await res.json()
    if (data.status === 'SUCCEEDED') return data.output?.[0]
    if (data.status === 'FAILED') throw new Error(data.failure || 'Runway task failed')
  }
  throw new Error('Runway task timed out')
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
  const fullPrompt = styleHint ? `${prompt}. ${styleHint}` : prompt
  const ratio = RESOLUTIONS[aspectRatio]?.[videoQuality] ?? '1080:1920'

  const body = {
    taskType: 'textToVideo',
    model: 'gen4_turbo',
    textPrompt: fullPrompt,
    ratio,
    duration: Number.parseInt(duration, 10),
    ...(characterReferenceUrl ? { referenceImages: [{ uri: characterReferenceUrl, weight: 0.85 }] } : {}),
  }

  const res = await fetch('/runway/v1/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Runway error ${res.status}`)
  }

  const data = await res.json()
  const url = await pollTask(data.id, apiKey)
  return { url }
}
