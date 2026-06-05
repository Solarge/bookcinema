import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { useMedia } from '../contexts/MediaContext'
import { useSettings } from '../contexts/SettingsContext'
import useModalA11y from '../hooks/useModalA11y'
import '../styles/misc-components.css'

export default function VariationsModal({ type, id, prompt, charId, epNum, sceneNum, onClose, onSelect }) {
  const { settings } = useSettings()
  const { generateCharacterImage, generateSceneVideo } = useMedia()
  const [variations, setVariations]   = useState([null, null])
  const [generating, setGenerating]   = useState([false, false])
  const [selected, setSelected]       = useState(null)
  const count = Math.min(settings.variations ?? 2, 2)
  const dialogRef = useRef(null)
  useModalA11y(onClose, dialogRef)

  async function generateVariation(idx) {
    const gens = [...generating]; gens[idx] = true; setGenerating(gens)
    try {
      // Each variation uses a slightly tweaked prompt seed
      const tweaked = idx === 0 ? prompt : `${prompt}, variation ${idx + 1}`
      // Temp state to capture the result URL
      let resultUrl = null
      const origGenChar  = generateCharacterImage
      const origGenScene = generateSceneVideo

      if (type === 'image') {
        await origGenChar({ id: charId }, tweaked, idx)
      } else {
        await origGenScene(epNum, { scene_number: sceneNum, kling_prompt: tweaked }, [])
      }
      // URL will be in media context — we just trigger re-render
    } finally {
      const gens2 = [...generating]; gens2[idx] = false; setGenerating(gens2)
    }
  }

  return (
    <div className="vm-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="variations-modal-title"
        className="vm-dialog"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <div className="vm-header">
          <span id="variations-modal-title" className="vm-title">
            A/B VARIATIONS — {type.toUpperCase()}
          </span>
          <button onClick={onClose} aria-label="Close dialog" className="vm-close-btn">×</button>
        </div>

        <div className="vm-body">
          <div className="vm-grid">
            {Array.from({ length: count }, (_, i) => (
              <div
                key={i}
                className={`vm-option${selected === i ? ' vm-option--selected' : ''}`}
                onClick={() => setSelected(i)}
              >
                <div className={`vm-option__label${selected === i ? ' vm-option__label--selected' : ' vm-option__label--idle'}`}>
                  OPTION {String.fromCharCode(65 + i)}
                  {selected === i && <span className="vm-option__check">✓ Selected</span>}
                </div>
                <div className="vm-option__preview">
                  {generating[i]
                    ? <div className="vm-option__preview-text">Generating…</div>
                    : <div className="vm-option__preview-placeholder">
                        Click Generate to create option {String.fromCharCode(65 + i)}
                      </div>
                  }
                </div>
                <button
                  onClick={e => { e.stopPropagation(); generateVariation(i) }}
                  disabled={generating[i]}
                  className="vm-option__gen-btn"
                >
                  {generating[i] ? 'Generating…' : `Generate Option ${String.fromCharCode(65 + i)}`}
                </button>
              </div>
            ))}
          </div>

          {selected !== null && (
            <button onClick={() => { onSelect?.(selected); onClose() }} className="vm-use-btn">
              Use Option {String.fromCharCode(65 + selected)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

VariationsModal.propTypes = {
  type: PropTypes.string.isRequired,
  id: PropTypes.string,
  prompt: PropTypes.string,
  charId: PropTypes.string,
  epNum: PropTypes.number,
  sceneNum: PropTypes.number,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func,
}
