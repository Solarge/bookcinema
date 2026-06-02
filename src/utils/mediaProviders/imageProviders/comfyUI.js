// ComfyUI — self-hosted, supports FLUX, SD3, SDXL and more
// Install: https://github.com/comfyanonymous/ComfyUI
// Run: python main.py --listen  →  API at http://localhost:8188
// Zero cost after hardware. Best for FLUX locally.

const DIMS = {
  '9:16': { standard: [768, 1344], hd: [1080, 1920], ultra: [1152, 2048] },
  '16:9': { standard: [1344, 768], hd: [1920, 1080], ultra: [2048, 1152] },
  '1:1':  { standard: [1024, 1024], hd: [1536, 1536], ultra: [2048, 2048] },
}

function buildWorkflow(prompt, width, height, imageQuality, fluxModel) {
  const steps = { standard: 20, hd: 28, ultra: 40 }[imageQuality] ?? 28
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: fluxModel } },
    '2': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: prompt } },
    '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: 'lowres, blurry, watermark' } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed: Math.floor(Math.random() * 1e9), steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'bookfilm_' } },
  }
}

async function pollHistory(baseUrl, promptId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${baseUrl}/history/${promptId}`)
    const data = await res.json()
    const result = data[promptId]
    if (result?.outputs?.['7']?.images?.[0]) {
      return result.outputs['7'].images[0]
    }
  }
  throw new Error('ComfyUI generation timed out')
}

export async function generateImage({ prompt, aspectRatio = '9:16', imageQuality = 'hd', baseUrl = 'http://localhost:8188', styleHint = '', fluxModel = 'flux1-dev-fp8.safetensors' }) {
  const [width, height] = DIMS[aspectRatio]?.[imageQuality] ?? [1080, 1920]
  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt
  const workflow = buildWorkflow(fullPrompt, width, height, imageQuality, fluxModel)

  const submitRes = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  }).catch(() => { throw new Error(`Cannot reach ComfyUI at ${baseUrl}. Launch with --listen flag.`) })

  const { prompt_id } = await submitRes.json()
  const imageInfo = await pollHistory(baseUrl, prompt_id)

  const imgRes = await fetch(`${baseUrl}/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder}&type=output`)
  const blob = await imgRes.blob()
  return { url: URL.createObjectURL(blob) }
}
