// Local Video — generic endpoint for self-hosted models
// Compatible with: CogVideoX, LTX-Video, Wan2.1, AnimateDiff
// via their Gradio/FastAPI interfaces or ComfyUI video nodes
//
// CogVideoX-5B: https://github.com/THUDM/CogVideo
// LTX-Video: https://github.com/Lightricks/LTX-Video
// Wan2.1: https://github.com/Wan-Video/Wan2.1
//
// Expected API format (OpenAI-compatible or Gradio):
//   POST {baseUrl}/generate  → { url } or { video_url }
//   OR Gradio: POST {baseUrl}/run/predict → { data: [{ video: { url } }] }

export async function generateVideo({ prompt, aspectRatio = '9:16', videoQuality = 'hd', baseUrl = 'http://localhost:7861', styleHint = '', duration = '5', localVideoMode = 'openai' }) {
  const fullPrompt = styleHint ? `${prompt}. ${styleHint}` : prompt

  if (localVideoMode === 'gradio') {
    return generateGradio(fullPrompt, aspectRatio, videoQuality, baseUrl, duration)
  }
  return generateOpenAI(fullPrompt, aspectRatio, videoQuality, baseUrl, duration)
}

async function generateOpenAI(prompt, aspectRatio, videoQuality, baseUrl, duration) {
  const res = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, duration, quality: videoQuality }),
  }).catch(() => { throw new Error(`Cannot reach local video server at ${baseUrl}`) })

  if (!res.ok) throw new Error(`Local video error ${res.status}`)
  const data = await res.json()
  const url = data.url || data.video_url || data.output
  if (!url) throw new Error('Local video server returned no URL')
  return { url }
}

async function generateGradio(prompt, aspectRatio, videoQuality, baseUrl, duration) {
  const res = await fetch(`${baseUrl}/run/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [prompt, aspectRatio, Number.parseInt(duration, 10), videoQuality] }),
  }).catch(() => { throw new Error(`Cannot reach Gradio server at ${baseUrl}`) })

  if (!res.ok) throw new Error(`Gradio server error ${res.status}`)
  const data = await res.json()
  const url = data.data?.[0]?.video?.url || data.data?.[0]?.url || data.data?.[0]
  if (!url) throw new Error('Gradio server returned no video')
  return { url }
}
