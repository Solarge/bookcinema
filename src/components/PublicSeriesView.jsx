import { useState, useEffect } from 'react'
import { getPublicShare } from '../lib/api'
import '../styles/public-series.css'

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
  return <h2 className="psv-section-head">{children}</h2>
}

function Label({ children }) {
  return <div className="psv-prod-label">{children}</div>
}

// ── Character card (read-only) ──────────────────────────────────────────────
function CharacterCard({ char }) {
  const rc = roleColor(char.role)
  return (
    <div className="psv-char-card">
      <div className="psv-char-card__namerow">
        <span className="psv-char-card__name">{char.name}</span>
        <span className="psv-char-card__role" style={{ border: `1px solid ${rc}`, color: rc }}>{char.role}</span>
        {char.age && <span className="psv-char-card__age">{char.age}</span>}
      </div>
      {char.description && <p className="psv-char-card__desc">{char.description}</p>}
    </div>
  )
}

// ── Episode section (read-only) ─────────────────────────────────────────────
function EpisodeSection({ episode, characters }) {
  const charName  = (id) => (characters || []).find(c => c.id === id)?.name || id
  const charColor = (id) => roleColor((characters || []).find(c => c.id === id)?.role)

  return (
    <section className="psv-episode" aria-label={`Episode ${episode.number}: ${episode.title}`}>
      <div className="psv-episode__heading">
        <span className="psv-episode__num">EPISODE {episode.number}</span>
        <h3 className="psv-episode__title">{episode.title}</h3>
      </div>
      {episode.summary && <p className="psv-episode__summary">{episode.summary}</p>}
      {episode.episode_hook && <p className="psv-episode__hook">{episode.episode_hook}</p>}

      {(episode.scenes || []).map((scene, idx) => (
        <div key={idx} className="psv-scene">
          <div className="psv-scene__header">
            <span className="psv-scene__num">Scene {scene.scene_number}</span>
            {scene.setting && <span className="psv-scene__setting">{scene.setting}</span>}
          </div>
          {scene.scene_description && (
            <p className="psv-scene__desc">{scene.scene_description}</p>
          )}
          {(scene.dialogue || []).map((line, dIdx) => (
            <div key={dIdx} className="psv-dialogue" style={{ borderLeft: `2px solid ${charColor(line.character)}44` }}>
              <div className="psv-dialogue__speaker" style={{ color: charColor(line.character) }}>
                {charName(line.character)}
              </div>
              <div className="psv-dialogue__line">&ldquo;{line.line}&rdquo;</div>
              {line.voice_direction && (
                <div className="psv-dialogue__dir">{line.voice_direction}</div>
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
      <div className="psv-loading">
        <div className="psv-loading__text">Loading…</div>
      </div>
    )
  }

  // Error / not found state
  if (state === 'error') {
    return (
      <div className="psv-error">
        <div className="psv-error__brand">BookFilm Studio</div>
        <div className="psv-error__msg">{errMsg || 'This share link is not available.'}</div>
        <a href="/" className="psv-error__link">Go to BookFilm Studio</a>
      </div>
    )
  }

  const s = data.series
  const { title, author, logline, series_hook, characters = [], episodes = [], production_guide } = s

  return (
    <div className="psv-page">
      {/* Public header */}
      <header className="psv-header">
        <div className="psv-header__brand">BookFilm Studio</div>
        <div className="psv-header__label">Shared Series — Read Only</div>
      </header>

      {/* Main content */}
      <main className="psv-main" aria-label="Shared series content">

        {/* Hero block */}
        <div className="psv-hero">
          <h1 className="psv-hero__title">{title}</h1>
          {author && <div className="psv-hero__author">{author}</div>}
          {logline && <p className="psv-hero__logline">{logline}</p>}
          {series_hook && <p className="psv-hero__hook">{series_hook}</p>}
        </div>

        {/* Characters */}
        {characters.length > 0 && (
          <section className="psv-chars-section" aria-label="Characters">
            <SectionHead>Character Bible</SectionHead>
            <div className="psv-chars-grid">
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
          <section className="psv-prod-section" aria-label="Production guide">
            <SectionHead>Production Guide</SectionHead>
            <div className="psv-prod-panel">
              {production_guide.visual_style && (
                <>
                  <Label>Visual Style</Label>
                  <p className="psv-prod-text">{production_guide.visual_style}</p>
                </>
              )}
              {production_guide.tone && (
                <>
                  <Label>Tone</Label>
                  <p className="psv-prod-text">{production_guide.tone}</p>
                </>
              )}
              {production_guide.cinematography_notes && (
                <>
                  <Label>Cinematography</Label>
                  <p className="psv-prod-text">{production_guide.cinematography_notes}</p>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="psv-footer">
        <a href="/" style={{ textDecoration: 'none' }} aria-label="Made with BookFilm Studio">
          <span className="psv-footer__brand">Made with BookFilm Studio</span>
        </a>
        <p className="psv-footer__disclosure">
          AI-generated content — review before publishing and disclose AI origin per platform rules.
        </p>
      </footer>
    </div>
  )
}
