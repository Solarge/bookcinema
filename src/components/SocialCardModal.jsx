import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { generateSocialCards } from '../utils/socialCards'
import useModalA11y from '../hooks/useModalA11y'
import '../styles/social-card-modal.css'

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
      className="scm-dialog"
    >
      <div className="scm-header">
        <span id="social-card-modal-title" className="scm-title">
          SOCIAL CARDS — EP {episode.number}
        </span>
        <button onClick={onClose} aria-label="Close dialog" className="scm-close-btn">×</button>
      </div>

      <div className="scm-tabs">
        {PLATFORMS.map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`scm-tab${p === platform ? ' scm-tab--active' : ''}`}
          >
            {PLATFORM_LABELS[p].split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="scm-body">
        <div className="scm-platform-label">{PLATFORM_LABELS[platform]}</div>
        <textarea
          value={text}
          readOnly
          rows={8}
          aria-label={`${PLATFORM_LABELS[platform]} caption`}
          className="scm-textarea"
        />
        <button
          onClick={copyText}
          className={`scm-copy-btn${copied ? ' scm-copy-btn--copied' : ' scm-copy-btn--default'}`}
        >
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
