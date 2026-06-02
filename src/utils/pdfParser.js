import * as pdfjsLib from 'pdfjs-dist'

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const MAX_CHARS = 60000

export async function parsePdf(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const totalPages = pdf.numPages
  let allText = ''

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(`Reading page ${i} of ${totalPages}...`)
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    allText += pageText + '\n'
  }

  return chunkText(allText)
}

function chunkText(text) {
  if (text.length <= MAX_CHARS) return text

  const keep25 = Math.floor(MAX_CHARS * 0.25)
  const keep10 = Math.floor(MAX_CHARS * 0.10)
  const first = text.slice(0, keep25)
  const last = text.slice(text.length - keep10)

  return (
    first +
    '\n\n[Middle section omitted for length — the story continues through various plot developments, character arcs, and key events before reaching the conclusion below.]\n\n' +
    last
  )
}
