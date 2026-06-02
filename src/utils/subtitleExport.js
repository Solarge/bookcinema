// Export dialogue as SRT subtitle file
function srtTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`
}

export function exportSRT(series) {
  let index = 1
  let currentTime = 0
  const lines = []

  for (const ep of series.episodes ?? []) {
    // Episode title card
    lines.push(`${index}\n${srtTime(currentTime)} --> ${srtTime(currentTime + 3)}\n[Episode ${ep.number}: ${ep.title}]\n`)
    currentTime += 4; index++

    for (const scene of ep.scenes ?? []) {
      for (const d of scene.dialogue ?? []) {
        const duration = Math.max(2, d.line.length * 0.06) // ~60ms per char
        lines.push(`${index}\n${srtTime(currentTime)} --> ${srtTime(currentTime + duration)}\n${d.line}\n`)
        currentTime += duration + 0.5; index++
      }
    }
  }

  const srt = lines.join('\n')
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${series.title?.replace(/\s+/g, '-').toLowerCase()}-subtitles.srt`
  a.click()
}

export function exportVTT(series) {
  let currentTime = 0
  const lines = ['WEBVTT\n']

  for (const ep of series.episodes ?? []) {
    lines.push(`NOTE Episode ${ep.number}: ${ep.title}\n`)
    for (const scene of ep.scenes ?? []) {
      for (const d of scene.dialogue ?? []) {
        const duration = Math.max(2, d.line.length * 0.06)
        const start = srtTime(currentTime).replace(',', '.')
        const end   = srtTime(currentTime + duration).replace(',', '.')
        lines.push(`${start} --> ${end}\n${d.line}\n`)
        currentTime += duration + 0.5
      }
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/vtt;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${series.title?.replace(/\s+/g, '-').toLowerCase()}-subtitles.vtt`
  a.click()
}
