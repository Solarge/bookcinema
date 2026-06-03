import { planFeatures } from './planFeatures.js'

// Returns true when the given plan should have a watermark applied
export function shouldWatermark(plan = 'free') { return planFeatures(plan).watermark }

// Add a subtle watermark to a blob image using Canvas API.
// Pass the active workspace plan as the third argument; defaults to 'free'
// so existing call-sites (which omit the argument) remain watermarked.
export async function applyWatermark(imageUrl, text = 'BookFilm Studio', plan = 'free') {
  if (!shouldWatermark(plan)) return imageUrl
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth  || img.width
      canvas.height = img.naturalHeight || img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      // Diagonal watermark text
      ctx.save()
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(-Math.PI / 6)
      ctx.font = `${Math.max(16, canvas.width * 0.04)}px Arial`
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Repeat across canvas
      for (let y = -canvas.height; y < canvas.height; y += 120) {
        for (let x = -canvas.width; x < canvas.width; x += 200) {
          ctx.fillText(text, x, y)
        }
      }
      ctx.restore()

      canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : imageUrl), 'image/jpeg', 0.92)
    }
    img.onerror = () => resolve(imageUrl)
    img.src = imageUrl
  })
}

export function isWatermarkMode(settings, plan = 'free') {
  // Plan-driven: watermark is on for free plan; settings.watermarkEnabled can still
  // force it on explicitly (e.g. for testing), but the plan gate is authoritative.
  return shouldWatermark(plan) || (settings?.watermarkEnabled ?? false)
}
