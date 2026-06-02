import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { generateSeriesBibleHtml } from './seriesBible'

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function blobFromUrl(url) {
  try {
    const res = await fetch(url)
    return await res.blob()
  } catch (_) {
    return null
  }
}

export async function exportZip(series, mediaState = {}, onProgress) {
  const zip = new JSZip()
  const root = zip.folder(slugify(series.title))
  let done = 0
  const tasks = []

  // Series bible HTML
  root.file('series-bible.html', generateSeriesBibleHtml(series, mediaState))

  // Characters folder
  const charsFolder = root.folder('characters')
  for (const char of series.characters || []) {
    const asset = mediaState.characters?.[char.id]
    const url = asset?.localUrl || asset?.remoteUrl
    if (url) {
      tasks.push(
        blobFromUrl(url).then(blob => {
          if (blob) charsFolder.file(`${slugify(char.name)}-portrait.jpg`, blob)
          onProgress?.(++done)
        })
      )
    }
  }

  // Episodes folders
  for (const ep of series.episodes || []) {
    const epFolder = root.folder(`episode-${ep.number}`)

    for (const scene of ep.scenes || []) {
      const key = `ep${ep.number}-s${scene.scene_number}`
      const asset = mediaState.scenes?.[key]
      const url = asset?.localUrl || asset?.remoteUrl
      if (url) {
        tasks.push(
          blobFromUrl(url).then(blob => {
            if (blob) epFolder.file(`scene-${scene.scene_number}.mp4`, blob)
            onProgress?.(++done)
          })
        )
      }

      // Dialogue audio
      for (let dIdx = 0; dIdx < (scene.dialogue || []).length; dIdx++) {
        const dKey = `${key}-d${dIdx}`
        const dAsset = mediaState.dialogue?.[dKey]
        const dUrl = dAsset?.audioUrl
        if (dUrl) {
          tasks.push(
            blobFromUrl(dUrl).then(blob => {
              if (blob) epFolder.file(`scene-${scene.scene_number}-dialogue-${dIdx + 1}.mp3`, blob)
              onProgress?.(++done)
            })
          )
        }
      }
    }
  }

  await Promise.all(tasks)

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  saveAs(blob, `${slugify(series.title)}-cinematic-series.zip`)
}
