// Add a subtle watermark to a blob image using Canvas API
export async function applyWatermark(imageUrl, text = 'BookFilm Studio') {
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

export function isWatermarkMode(settings) {
  // Watermark in free mode (no subscription) — Phase 2 will wire to actual plan
  return settings?.watermarkEnabled ?? false
}
