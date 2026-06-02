import { fal } from '@fal-ai/client'

// Model tier by quality
const IMAGE_MODELS = {
  standard: 'fal-ai/flux/dev',
  hd:       'fal-ai/flux-pro/v1.1',
  ultra:    'fal-ai/flux-pro/v1.1-ultra',
}

const ASPECT_MAP = {
  '9:16': 'portrait_16_9',
  '16:9': 'landscape_16_9',
  '1:1':  'square_hd',
}

// Ultra model uses different size tokens
const ULTRA_ASPECT_MAP = {
  '9:16': 'portrait_4_3',   // closest ultra supports
  '16:9': 'landscape_4_3',
  '1:1':  'square',
}

export async function generateImage({ prompt, aspectRatio = '9:16', imageQuality = 'hd', apiKey, characterReferenceUrl, styleHint = '' }) {
  fal.config({ credentials: apiKey })

  const model = IMAGE_MODELS[imageQuality] ?? IMAGE_MODELS.hd
  const isUltra = imageQuality === 'ultra'
  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt

  const input = isUltra
    ? {
        prompt: fullPrompt,
        aspect_ratio: aspectRatio,  // ultra uses raw ratio string
        output_format: 'jpeg',
        safety_tolerance: 2,
        ...(characterReferenceUrl ? { image_url: characterReferenceUrl } : {}),
      }
    : {
        prompt: fullPrompt,
        image_size: ASPECT_MAP[aspectRatio] ?? 'portrait_16_9',
        num_inference_steps: imageQuality === 'standard' ? 20 : 28,
        guidance_scale: 3.5,
        num_images: 1,
        safety_tolerance: '2',
        ...(characterReferenceUrl ? { image_url: characterReferenceUrl } : {}),
      }

  const result = await fal.subscribe(model, { input })

  const url = result.data?.images?.[0]?.url
  if (!url) throw new Error('fal.ai returned no image URL')
  return { url }
}
