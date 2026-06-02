function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function roleColor(role) {
  const r = (role || '').toLowerCase()
  if (r.includes('protagonist')) return '#e8a080'
  if (r.includes('antagonist')) return '#d080d0'
  if (r.includes('love')) return '#80a8e8'
  if (r.includes('ally')) return '#a0c880'
  return '#d4c080'
}

export function generateSeriesBibleHtml(series, mediaState = {}) {
  const { title, author, logline, series_hook, characters = [], episodes = [], production_guide = {} } = series

  const charSection = characters.map(char => {
    const imgUrl = mediaState?.characters?.[char.id]?.localUrl
    return `
    <div style="page-break-inside:avoid;background:#0e1219;border:1px solid #1e2d3d;padding:24px;margin-bottom:24px;display:flex;gap:24px;flex-wrap:wrap;">
      ${imgUrl ? `<img src="${imgUrl}" style="width:160px;height:213px;object-fit:cover;flex-shrink:0;" alt="${esc(char.name)}">` : '<div style="width:160px;height:213px;background:#141b24;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#3a4a5a;font-size:11px;">No Image</div>'}
      <div style="flex:1;min-width:200px;">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
          <span style="font-family:'Cinzel',serif;font-size:22px;color:#f2ead8;">${esc(char.name)}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 8px;border:1px solid ${roleColor(char.role)};color:${roleColor(char.role)};letter-spacing:1.5px;text-transform:uppercase;">${esc(char.role)}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#7a6848;">${esc(char.age)}</span>
        </div>
        <p style="font-style:italic;color:#c0b090;margin-bottom:16px;">${esc(char.description)}</p>
        <div style="margin-bottom:12px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:3px;color:#c8922a;margin-bottom:6px;">MIDJOURNEY PROMPT</div>
          <pre style="background:#0a0806;border-left:3px solid #c8922a;padding:12px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#c8b090;white-space:pre-wrap;word-break:break-word;">${esc(char.midjourney_prompt)}</pre>
        </div>
        <div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:3px;color:#7a6848;margin-bottom:4px;">ELEVENLABS VOICE</div>
          <p style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#6a8090;">${esc(char.elevenlabs_voice)}</p>
        </div>
      </div>
    </div>`
  }).join('')

  const epSummaries = episodes.map(ep => `
    <div style="margin-bottom:20px;padding:16px;background:#0e1219;border:1px solid #1e2d3d;">
      <div style="font-family:'Cinzel',serif;font-size:16px;color:#c8922a;margin-bottom:4px;">Episode ${ep.number}: ${esc(ep.title)}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#7a6848;margin-bottom:8px;">${esc(ep.duration)} · ${esc(ep.mood)}</div>
      <p style="font-style:italic;color:#c0b090;">${esc(ep.social_hook)}</p>
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)} — Series Bible</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;1,400&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { background:#080b10; color:#f2ead8; font-family:'Cormorant Garamond',serif; font-size:16px; line-height:1.7; padding:40px 24px; }
.page { max-width:900px; margin:0 auto; }
h2 { font-family:'Cinzel',serif; font-size:13px; letter-spacing:4px; color:#c8922a; text-transform:uppercase; margin:40px 0 20px; padding-bottom:10px; border-bottom:1px solid #1e2d3d; }
pre { overflow-x:auto; }
@media print { body { background:white; color:#1a1208; } }
</style>
</head>
<body>
<div class="page">
  <div style="text-align:center;padding:60px 0 48px;border-bottom:1px solid #1e2d3d;margin-bottom:48px;">
    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:4px;color:#7a6848;margin-bottom:12px;">SERIES BIBLE</div>
    <h1 style="font-family:'Cinzel',serif;font-size:48px;color:#f2ead8;margin-bottom:8px;">${esc(title)}</h1>
    <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#c8922a;letter-spacing:2px;margin-bottom:20px;">${esc(author)}</div>
    <p style="font-style:italic;color:#7a6848;max-width:600px;margin:0 auto 12px;">${esc(logline)}</p>
    <p style="color:#c8b890;max-width:600px;margin:0 auto;">${esc(series_hook)}</p>
  </div>
  <h2>Character Bible</h2>
  ${charSection}
  <h2>Episode Summaries</h2>
  ${epSummaries}
  ${production_guide.visual_style ? `<h2>Production Notes</h2>
  <div style="background:#0e1219;border:1px solid #1e2d3d;padding:20px;margin-bottom:16px;">
    <div style="font-family:'Cinzel',serif;font-size:11px;letter-spacing:3px;color:#c8922a;margin-bottom:8px;">VISUAL STYLE</div>
    <p style="font-style:italic;color:#c0b090;">${esc(production_guide.visual_style)}</p>
  </div>
  <div style="background:#0e1219;border:1px solid #1e2d3d;padding:20px;">
    <div style="font-family:'Cinzel',serif;font-size:11px;letter-spacing:3px;color:#c8922a;margin-bottom:8px;">MUSIC DIRECTION</div>
    <p style="color:#c0b090;">${esc(production_guide.music_direction)}</p>
  </div>` : ''}
  <div style="text-align:center;margin-top:60px;padding-top:24px;border-top:1px solid #1e2d3d;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;color:#3a4a5a;">Generated by BookFilm Studio</div>
</div>
</body>
</html>`
}
