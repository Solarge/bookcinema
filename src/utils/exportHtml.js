export function exportHtml(series) {
  const html = buildHtml(series)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${series.title.toLowerCase().replace(/\s+/g, '-')}-cinematic-series.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function roleColor(role) {
  const r = (role || '').toLowerCase()
  if (r.includes('protagonist')) return '#e8a080'
  if (r.includes('antagonist')) return '#d080d0'
  if (r.includes('love')) return '#80a8e8'
  if (r.includes('ally')) return '#a0c880'
  return '#d4c080'
}

function charColor(charId, characters) {
  const char = characters.find(c => c.id === charId)
  return char ? roleColor(char.role) : '#d4c080'
}

function charName(charId, characters) {
  const char = characters.find(c => c.id === charId)
  return char ? char.name : charId
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(series) {
  const { title, author, logline, series_hook, characters = [], episodes = [], production_guide = {} } = series

  const charactersHtml = characters.map(char => `
    <div style="background:#0e1219;border:1px solid #1e2d3d;padding:24px;margin-bottom:20px;">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:8px;">
        <span style="font-family:'Cinzel',serif;font-size:20px;color:#f2ead8;">${esc(char.name)}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:2px 8px;border:1px solid ${roleColor(char.role)};color:${roleColor(char.role)};letter-spacing:1px;text-transform:uppercase;">${esc(char.role)}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#7a6848;">${esc(char.age)}</span>
      </div>
      <p style="font-style:italic;color:#c8b890;margin-bottom:16px;">${esc(char.description)}</p>
      <div style="margin-bottom:12px;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;color:#c8922a;margin-bottom:6px;">MIDJOURNEY PROMPT</div>
        <pre style="background:#0a0806;border-left:3px solid #c8922a;padding:14px 16px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#c8b090;white-space:pre-wrap;word-break:break-word;">${esc(char.midjourney_prompt)}</pre>
      </div>
      <div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;color:#7a6848;margin-bottom:4px;">ELEVENLABS VOICE</div>
        <p style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#7a8090;">${esc(char.elevenlabs_voice)}</p>
      </div>
    </div>
  `).join('')

  const episodesHtml = episodes.map(ep => {
    const scenesHtml = (ep.scenes || []).map(scene => {
      const dialogueHtml = (scene.dialogue || []).map(d => `
        <div style="margin-bottom:16px;padding-left:16px;border-left:2px solid ${charColor(d.character, characters)}22;">
          <div style="font-family:'Cinzel',serif;font-size:11px;font-variant:small-caps;letter-spacing:2px;color:${charColor(d.character, characters)};margin-bottom:4px;">${esc(charName(d.character, characters))}</div>
          <div style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px;color:#f2ead8;line-height:1.6;margin-bottom:4px;">"${esc(d.line)}"</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#4a5a6a;">${esc(d.voice_direction)}</div>
        </div>
      `).join('')

      return `
        <div style="margin-bottom:32px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:3px;color:#7a6848;text-transform:uppercase;border-top:1px solid #1e2d3d;padding-top:20px;margin-bottom:16px;">${esc(scene.slug)}</div>
          <div style="margin-bottom:12px;">
            <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;color:#c8922a;margin-bottom:6px;">KLING AI PROMPT</div>
            <pre style="background:#0a0806;border-left:3px solid #c8922a;padding:14px 16px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#c8b090;white-space:pre-wrap;word-break:break-word;">${esc(scene.kling_prompt)}</pre>
          </div>
          <p style="font-style:italic;color:#7a6848;margin-bottom:20px;">${esc(scene.stage_direction)}</p>
          ${dialogueHtml}
        </div>
      `
    }).join('')

    return `
      <div style="margin-bottom:60px;border-top:1px solid #1e2d3d;padding-top:40px;">
        <div style="margin-bottom:24px;">
          <div style="font-family:'Cinzel',serif;font-size:64px;color:#c8922a;opacity:0.3;line-height:1;margin-bottom:-8px;">${String(ep.number).padStart(2, '0')}</div>
          <div style="font-family:'Cinzel',serif;font-size:28px;color:#f2ead8;">${esc(ep.title)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
            ${[ep.duration, ep.mood, ...(ep.locations || [])].map(t => `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:3px 10px;border:1px solid #1e2d3d;color:#7a6848;">${esc(t)}</span>`).join('')}
          </div>
        </div>
        <div style="background:#3a0808;border-left:3px solid #8b1a1a;padding:16px 20px;margin-bottom:28px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;color:#a05050;margin-bottom:6px;">SOCIAL HOOK</div>
          <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px;color:#f2d0c0;">${esc(ep.social_hook)}</p>
        </div>
        ${scenesHtml}
        <div style="background:#3a0808;padding:16px 20px;margin-top:8px;margin-bottom:12px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;color:#a05050;margin-bottom:4px;">CALL TO ACTION</div>
          <p style="color:#f2d0c0;">${esc(ep.cta)}</p>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${(ep.hashtags || []).map(tag => `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#7a6848;">${esc(tag.startsWith('#') ? tag : '#' + tag)}</span>`).join('')}
        </div>
      </div>
    `
  }).join('')

  const guideHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
      ${production_guide.visual_style ? `<div style="background:#0e1219;border:1px solid #1e2d3d;padding:20px;"><div style="font-family:'Cinzel',serif;font-size:12px;letter-spacing:3px;color:#c8922a;margin-bottom:10px;">VISUAL STYLE</div><p style="font-style:italic;color:#c8b890;">${esc(production_guide.visual_style)}</p></div>` : ''}
      ${production_guide.music_direction ? `<div style="background:#0e1219;border:1px solid #1e2d3d;padding:20px;"><div style="font-family:'Cinzel',serif;font-size:12px;letter-spacing:3px;color:#c8922a;margin-bottom:10px;">MUSIC</div><p style="color:#c8b890;">${esc(production_guide.music_direction)}</p></div>` : ''}
      ${production_guide.posting_schedule ? `<div style="background:#0e1219;border:1px solid #1e2d3d;padding:20px;"><div style="font-family:'Cinzel',serif;font-size:12px;letter-spacing:3px;color:#c8922a;margin-bottom:10px;">POSTING SCHEDULE</div><p style="color:#c8b890;">${esc(production_guide.posting_schedule)}</p></div>` : ''}
      ${Array.isArray(production_guide.recommended_tools) && production_guide.recommended_tools.length ? `<div style="background:#0e1219;border:1px solid #1e2d3d;padding:20px;"><div style="font-family:'Cinzel',serif;font-size:12px;letter-spacing:3px;color:#c8922a;margin-bottom:10px;">TOOLS</div><ul style="list-style:none;color:#c8b890;">${production_guide.recommended_tools.map(t => `<li style="margin-bottom:4px;">→ ${esc(t)}</li>`).join('')}</ul></div>` : ''}
      ${Array.isArray(production_guide.engagement_tips) && production_guide.engagement_tips.length ? `<div style="background:#0e1219;border:1px solid #1e2d3d;padding:20px;"><div style="font-family:'Cinzel',serif;font-size:12px;letter-spacing:3px;color:#c8922a;margin-bottom:10px;">ENGAGEMENT TIPS</div><ul style="list-style:none;color:#c8b890;">${production_guide.engagement_tips.map(t => `<li style="margin-bottom:6px;">→ ${esc(t)}</li>`).join('')}</ul></div>` : ''}
    </div>
  `

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Cinematic Series</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=JetBrains+Mono:ital,wght@0,300;0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #080b10; color: #f2ead8; font-family: 'Cormorant Garamond', serif; font-size: 16px; line-height: 1.7; padding: 40px 24px; }
.container { max-width: 860px; margin: 0 auto; }
::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0e1219; } ::-webkit-scrollbar-thumb { background: #1e2d3d; }
</style>
</head>
<body>
<div class="container">
  <div style="text-align:center;padding:60px 0 48px;border-bottom:1px solid #1e2d3d;margin-bottom:48px;">
    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:4px;color:#7a6848;text-transform:uppercase;margin-bottom:16px;">Cinematic Series Package</div>
    <h1 style="font-family:'Cinzel',serif;font-size:clamp(32px,5vw,56px);font-weight:700;color:#f2ead8;letter-spacing:-0.5px;margin-bottom:8px;">${esc(title)}</h1>
    <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#c8922a;letter-spacing:2px;margin-bottom:20px;">${esc(author)}</div>
    <p style="font-style:italic;color:#7a6848;max-width:600px;margin:0 auto 16px;">${esc(logline)}</p>
    <p style="color:#c8b890;max-width:600px;margin:0 auto;">${esc(series_hook)}</p>
  </div>

  <div style="margin-bottom:60px;">
    <div style="font-family:'Cinzel',serif;font-size:14px;letter-spacing:4px;color:#c8922a;text-transform:uppercase;margin-bottom:28px;padding-bottom:12px;border-bottom:1px solid #1e2d3d;">Character Bible</div>
    ${charactersHtml}
  </div>

  <div style="margin-bottom:60px;">
    <div style="font-family:'Cinzel',serif;font-size:14px;letter-spacing:4px;color:#c8922a;text-transform:uppercase;margin-bottom:28px;padding-bottom:12px;border-bottom:1px solid #1e2d3d;">Episodes</div>
    ${episodesHtml}
  </div>

  <div>
    <div style="font-family:'Cinzel',serif;font-size:14px;letter-spacing:4px;color:#c8922a;text-transform:uppercase;margin-bottom:28px;padding-bottom:12px;border-bottom:1px solid #1e2d3d;">Production Guide</div>
    ${guideHtml}
  </div>

  <div style="text-align:center;margin-top:60px;padding-top:24px;border-top:1px solid #1e2d3d;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;color:#3a4a5a;">Generated by BookFilm Studio</div>
</div>
</body>
</html>`
}
