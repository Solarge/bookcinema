// Automatic1111 — self-hosted Stable Diffusion WebUI
// Install: https://github.com/AUTOMATIC1111/stable-diffusion-webui
// Run with: --api flag  →  API at http://localhost:7860
// Zero cost after hardware. Supports SD1.5, SDXL, FLUX via extensions.

const DIMS = {
  '9:16': { standard: [768, 1344], hd: [1080, 1920], ultra: [1152, 2048] },
  '16:9': { standard: [1344, 768], hd: [1920, 1080], ultra: [2048, 1152] },
  '1:1':  { standard: [1024, 1024], hd: [1536, 1536], ultra: [2048, 2048] },
}

const STEPS = { standard: 20, hd: 28, ultra: 40 }

export async function generateImage({ prompt, aspectRatio = '9:16', imageQuality = 'hd', baseUrl = 'http://localhost:7860', styleHint = '' }) {
  const [width, height] = DIMS[aspectRatio]?.[imageQuality] ?? [1080, 1920]
  const fullPrompt = styleHint ? `${prompt}, ${styleHint}` : prompt

  const res = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: fullPrompt,
      negative_prompt: 'lowres, bad anatomy, blurry, watermark, nsfw',
      width,
      height,
      steps: STEPS[imageQuality] ?? 28,
      cfg_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
      batch_size: 1,
    }),
  }).catch(() => { throw new Error(`Cannot reach Automatic1111 at ${baseUrl}. Launch with --api flag.`) })

  if (!res.ok) throw new Error(`A1111 error ${res.status}`)

  const data = await res.json()
  const base64 = data.images?.[0]
  if (!base64) throw new Error('A1111 returned no image')
  return { url: `data:image/png;base64,${base64}` }
}
