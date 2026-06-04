import { useState, useEffect } from 'react'
import { getPublicShare } from '../lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────
function roleColor(role) {
  const r = (role || '').toLowerCase()
  if (r.includes('protagonist')) return '#c89640'
  if (r.includes('antagonist'))  return '#b04040'
  if (r.includes('love'))        return '#c07080'
  if (r.includes('ally'))        return '#6090a0'
  return '#7a8a9a'
}

function SectionHead({ children }) {
  return (
    <h2 style={{
      fontFamily: "'Cinzel', serif", fontSize: '13px', letterSpacing: '4px',
      textTransform: 'uppercase', color: 'var(--gold)', borderBottom: '1px solid var(--border)',
      paddingBottom: '10px', marginBottom: '24px',
    }}>{children}</h2>
  )
}

function Label({ children }) {
  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px', marginTop: '10px' }}>
      {children}
    </div>
  )
}

// ── Character card (read-only) ──────────────────────────────────────────────
function CharacterCard({ char }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', color: 'var(--cream)' }}>{char.name}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', padding: '2px 8px', border: `1px solid ${roleColor(char.role)}`, color: roleColor(char.role), letterSpacing: '1.5px', textTransform: 'uppercase' }}>{char.role}</span>
        {char.age && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>{char.age}</span>}
      </div>
      {char.description && (
        <p style={{ fontStyle: 'italic', color: '#c0b090', fontSize: '15px', lineHeight: '1.6' }}>{char.description}</p>
      )}
    </div>
  )
}

// ── Episode section (read-only) ─────────────────────────────────────────────
function EpisodeSection({ episode, characters }) {
  const charName = (id) => (characters || []).find(c => c.id === id)?.name || id
  const charColor = (id) => roleColor((characters || []).find(c => c.id === id)?.role)

  return (
    <section style={{ marginBottom: '56px' }} aria-label={`Episode ${episode.number}: ${episode.title}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '16px' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '3px', color: 'var(--gold)', opacity: 0.6 }}>EPISODE {episode.number}</span>
        <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', color: 'var(--cream)', margin: 0 }}>{episode.title}</h3>
      </div>
      {episode.summary && (
        <p style={{ fontStyle: 'italic', color: '#9090a0', marginBottom: '8px', fontSize: '15px', lineHeight: '1.7' }}>{episode.summary}</p>
      )}
      {episode.episode_hook && (
        <p style={{ color: '#c8b890', fontSize: '16px', marginBottom: '24px', lineHeight: '1.6' }}>{episode.episode_hook}</p>
      )}

      {(episode.scenes || []).map((scene, idx) => (
        <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', letterSpacing: '2px', color: 'var(--muted)', textTransform: 'uppercase' }}>Scene {scene.scene_number}</span>
            {scene.setting && (
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--gold)', letterSpacing: '1px' }}>{scene.setting}</span>
            )}
          </div>
          {scene.scene_description && (
            <p style={{ color: 'var(--muted)', fontSize: '15px', lineHeight: '1.7', marginBottom: '14px' }}>{scene.scene_description}</p>
          )}
          {(scene.dialogue || []).map((line, dIdx) => (
            <div key={dIdx} style={{ marginBottom: '14px', paddingLeft: '16px', borderLeft: `2px solid ${charColor(line.character)}44` }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', fontVariant: 'small-caps', letterSpacing: '2px', color: charColor(line.character), marginBottom: '4px' }}>
                {charName(line.character)}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '19px', color: 'var(--cream)', lineHeight: '1.6' }}>
                &ldquo;{line.line}&rdquo;
              </div>
              {line.voice_direction && (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#4a5a6a', marginTop: '4px' }}>{line.voice_direction}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function PublicSeriesView({ token }) {
  const [state, setState] = useState('loading') // 'loading' | 'ready' | 'error'
  const [data, setData] = useState(null)        // { series, assets }
  const [errMsg, setErrMsg] = useState(null)

  useEffect(() => {
    if (!token) { setState('error'); setErrMsg('No share token provided.'); return }
    let cancelled = false
    getPublicShare(token)
      .then(res => { if (!cancelled) { setData(res); setState('ready') } })
      .catch(err => {
        if (!cancelled) {
          setState('error')
          if (err.status === 404) setErrMsg('This share link is not available — it may have been revoked.')
          else setErrMsg(err.message || 'Failed to load shared series.')
        }
      })
    return () => { cancelled = true }
  }, [token])

  // Loading state
  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--muted)', letterSpacing: '3px' }}>Loading…</div>
      </div>
    )
  }

  // Error / not found state
  if (state === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '24px' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', letterSpacing: '4px', color: 'var(--gold)', opacity: 0.5, textTransform: 'uppercase', marginBottom: '8px' }}>BookFilm Studio</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '24px', color: 'var(--muted)', textAlign: 'center', maxWidth: '480px' }}>
          {errMsg || 'This share link is not available.'}
        </div>
        <a href="/" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '2px', color: 'var(--gold)', textDecoration: 'none', marginTop: '16px', border: '1px solid var(--border)', padding: '8px 20px' }}>
          Go to BookFilm Studio
        </a>
      </div>
    )
  }

  const s = data.series
  const { title, author, logline, series_hook, characters = [], episodes = [], production_guide } = s

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Public header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', letterSpacing: '3px', color: 'var(--gold)', textTransform: 'uppercase' }}>
          BookFilm Studio
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1px' }}>
          Shared Series — Read Only
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 24px' }} aria-label="Shared series content">

        {/* Hero block */}
        <div style={{ marginBottom: '56px', paddingBottom: '36px', borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '36px', fontWeight: '600', color: 'var(--cream)', marginBottom: '6px', lineHeight: '1.3' }}>{title}</h1>
          {author && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--gold)', letterSpacing: '2px', marginBottom: '20px' }}>{author}</div>
          )}
          {logline && (
            <p style={{ fontStyle: 'italic', color: 'var(--muted)', marginBottom: '12px', fontSize: '17px', lineHeight: '1.6' }}>{logline}</p>
          )}
          {series_hook && (
            <p style={{ color: '#c8b890', fontSize: '18px', lineHeight: '1.6' }}>{series_hook}</p>
          )}
        </div>

        {/* Characters */}
        {characters.length > 0 && (
          <section style={{ marginBottom: '64px' }} aria-label="Characters">
            <SectionHead>Character Bible</SectionHead>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {characters.map(char => <CharacterCard key={char.id || char.name} char={char} />)}
            </div>
          </section>
        )}

        {/* Episodes */}
        {episodes.length > 0 && (
          <section aria-label="Episodes">
            <SectionHead>Episodes</SectionHead>
            {episodes.map(ep => (
              <EpisodeSection key={ep.number} episode={ep} characters={characters} />
            ))}
          </section>
        )}

        {/* Production guide (trimmed) */}
        {production_guide && (
          <section style={{ marginBottom: '48px' }} aria-label="Production guide">
            <SectionHead>Production Guide</SectionHead>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px' }}>
              {production_guide.visual_style && (
                <>
                  <Label>Visual Style</Label>
                  <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.7', marginBottom: '12px' }}>{production_guide.visual_style}</p>
                </>
              )}
              {production_guide.tone && (
                <>
                  <Label>Tone</Label>
                  <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.7', marginBottom: '12px' }}>{production_guide.tone}</p>
                </>
              )}
              {production_guide.cinematography_notes && (
                <>
                  <Label>Cinematography</Label>
                  <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.7' }}>{production_guide.cinematography_notes}</p>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '24px', textAlign: 'center', marginTop: '32px' }}>
        <a href="/" style={{ textDecoration: 'none' }} aria-label="Made with BookFilm Studio">
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '3px', color: 'var(--gold)', opacity: 0.5, textTransform: 'uppercase' }}>
            Made with BookFilm Studio
          </span>
        </a>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#2a3a4a', marginTop: '8px', letterSpacing: '1px' }}>
          AI-generated content — review before publishing and disclose AI origin per platform rules.
        </p>
      </footer>
    </div>
  )
}
