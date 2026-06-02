import { fal } from '@fal-ai/client'

// Model tier by quality — each tier is a different Kling endpoint
const VIDEO_MODELS = {
  standard: 'fal-ai/kling-video/v1/standard/text-to-video',
  hd:       'fal-ai/kling-video/v1/pro/text-to-video',
  master:   'fal-ai/kling-video/v2/master/text-to-video',
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
  fal.config({ credentials: apiKey })

  const model = VIDEO_MODELS[videoQuality] ?? VIDEO_MODELS.hd
  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt

  const result = await fal.subscribe(model, {
    input: {
      prompt: fullPrompt,
      aspect_ratio: aspectRatio,
      duration,
      ...(characterReferenceUrl ? { image_url: characterReferenceUrl } : {}),
    },
    pollInterval: 5000,
    timeout: 600000,
  })

  const url = result.data?.video?.url
  if (!url) throw new Error('fal.ai Kling returned no video URL')
  return { url }
}
