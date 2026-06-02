import { useState } from 'react'
import PropTypes from 'prop-types'
import { useMedia } from '../contexts/MediaContext'
import { useSettings } from '../contexts/SettingsContext'

export default function VariationsModal({ type, id, prompt, charId, epNum, sceneNum, onClose, onSelect }) {
  const { settings } = useSettings()
  const { generateCharacterImage, generateSceneVideo } = useMedia()
  const [variations, setVariations]   = useState([null, null])
  const [generating, setGenerating]   = useState([false, false])
  const [selected, setSelected]       = useState(null)
  const count = Math.min(settings.variations ?? 2, 2)

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: '100%', maxWidth: '800px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

        <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: 'var(--gold)', letterSpacing: '3px' }}>
            A/B VARIATIONS — {type.toUpperCase()}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {Array.from({ length: count }, (_, i) => (
              <div key={i} style={{ border: `2px solid ${selected === i ? 'var(--gold)' : 'var(--border)'}`, padding: '12px', cursor: 'pointer', transition: 'border-color 0.15s' }} onClick={() => setSelected(i)}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '2px', color: selected === i ? 'var(--gold)' : 'var(--muted)', marginBottom: '10px' }}>
                  OPTION {String.fromCharCode(65 + i)}
                  {selected === i && <span style={{ marginLeft: '8px', color: '#6dc87a' }}>✓ Selected</span>}
                </div>
                <div style={{ minHeight: '120px', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', border: '1px dashed var(--border)' }}>
                  {generating[i] ? (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>Generating…</div>
                  ) : (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#4a5a6a', textAlign: 'center', padding: '16px' }}>
                      Click Generate to create option {String.fromCharCode(65 + i)}
                    </div>
                  )}
                </div>
                <button onClick={e => { e.stopPropagation(); generateVariation(i) }} disabled={generating[i]}
                  style={{ width: '100%', background: generating[i] ? 'var(--border)' : 'transparent', border: `1px solid ${generating[i] ? 'var(--border)' : 'var(--gold)'}`, color: generating[i] ? 'var(--muted)' : 'var(--gold)', padding: '8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', cursor: generating[i] ? 'not-allowed' : 'pointer' }}>
                  {generating[i] ? 'Generating…' : `Generate Option ${String.fromCharCode(65 + i)}`}
                </button>
              </div>
            ))}
          </div>

          {selected !== null && (
            <button onClick={() => { onSelect?.(selected); onClose() }} style={{ display: 'block', width: '100%', marginTop: '16px', background: 'var(--gold)', color: '#080b10', border: 'none', padding: '12px', fontFamily: "'Cinzel', serif", fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer', fontWeight: '600' }}>
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
