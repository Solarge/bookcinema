import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { generateSocialCards } from '../utils/socialCards'
import useModalA11y from '../hooks/useModalA11y'

const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'linkedin', 'youtube']
const PLATFORM_LABELS = { instagram: '📸 Instagram', tiktok: '🎵 TikTok', twitter: '𝕏 X / Twitter', linkedin: '💼 LinkedIn', youtube: '▶ YouTube' }

export default function SocialCardModal({ episode, series, onClose }) {
  const [platform, setPlatform] = useState('instagram')
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef(null)
  useModalA11y(onClose, dialogRef)
  const cards = generateSocialCards(episode, series)
  const text = cards[platform]

  function copyText() {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Backdrop clicks land on the <dialog> element itself (not a child).
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="social-card-modal-title"
      onClick={handleBackdropClick}
      onKeyDown={e => e.key === 'Enter' && e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, margin: 'auto',
        background: 'var(--surface)', border: '1px solid var(--border)',
        width: '100%', maxWidth: '560px', overflow: 'hidden',
        padding: 0,
      }}
    >
      <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span id="social-card-modal-title" style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold)', letterSpacing: '2px' }}>
          SOCIAL CARDS — EP {episode.number}
        </span>
        <button onClick={onClose} aria-label="Close dialog" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
        {PLATFORMS.map(p => (
          <button key={p} onClick={() => setPlatform(p)} style={{
            flex: 1,
            background: p === platform ? 'rgba(200,146,42,0.1)' : 'transparent',
            border: 'none',
            borderBottom: p === platform ? '2px solid var(--gold)' : '2px solid transparent',
            color: p === platform ? 'var(--gold)' : 'var(--muted)',
            padding: '10px 4px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            letterSpacing: '1px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            {PLATFORM_LABELS[p].split(' ')[0]}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', marginBottom: '8px', letterSpacing: '2px' }}>
          {PLATFORM_LABELS[platform]}
        </div>
        <textarea
          value={text}
          readOnly
          rows={8}
          aria-label={`${PLATFORM_LABELS[platform]} caption`}
          style={{
            width: '100%',
            background: '#0a0806',
            border: '1px solid var(--border)',
            color: 'var(--cream)',
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '15px',
            lineHeight: '1.7',
            padding: '14px',
            resize: 'none',
            outline: 'none',
          }}
        />
        <button onClick={copyText} style={{
          display: 'block',
          width: '100%',
          marginTop: '10px',
          background: copied ? 'rgba(109,200,122,0.1)' : 'var(--gold)',
          color: copied ? '#6dc87a' : '#080b10',
          border: copied ? '1px solid #3a7a4a' : 'none',
          padding: '11px',
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}>
          {copied ? '✓ Copied!' : 'Copy Caption'}
        </button>
      </div>
    </dialog>
  )
}

SocialCardModal.propTypes = {
  episode: PropTypes.shape({ number: PropTypes.number }).isRequired,
  series:  PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
}
