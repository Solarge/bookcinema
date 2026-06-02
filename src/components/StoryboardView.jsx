import { useMedia } from '../contexts/MediaContext'
import ApprovalBadge from './ApprovalBadge'

const STATUS_COLORS = { idle: '#3a4a5a', generating: '#c8922a', done: '#6dc87a', error: '#f08080' }

export default function StoryboardView({ series, onClose, onGenerateScene }) {
  const { scenes, setSceneApproval } = useMedia()

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, overflowY: 'auto', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '20px', color: 'var(--gold)' }}>Storyboard</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '2px' }}>{series.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', padding: '8px 16px', cursor: 'pointer', letterSpacing: '2px' }}>
            ← Back to Script
          </button>
        </div>

        {(series.episodes || []).map(ep => (
          <div key={ep.number} style={{ marginBottom: '40px' }}>
            {/* Episode row header */}
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold)', letterSpacing: '3px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
              EP {ep.number} — {ep.title}
            </div>

            {/* Scene grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {(ep.scenes || []).map(scene => {
                const key = `ep${ep.number}-s${scene.scene_number}`
                const asset = scenes[key] ?? {}
                const statusColor = STATUS_COLORS[asset.status || 'idle']

                return (
                  <div key={key} style={{ background: 'var(--surface)', border: `1px solid ${statusColor}55`, overflow: 'hidden' }}>
                    {/* Thumbnail / video */}
                    <div style={{ height: '110px', background: '#0a0806', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {asset.localUrl ? (
                        <video src={asset.localUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor }} />
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: statusColor, letterSpacing: '1px', textTransform: 'uppercase' }}>
                            {asset.status === 'generating' ? 'Generating…' : asset.status === 'error' ? 'Error' : 'No Video'}
                          </span>
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: '4px', left: '4px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', background: 'rgba(8,11,16,0.8)', padding: '2px 6px' }}>
                        S{scene.scene_number}
                      </div>
                    </div>

                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {scene.slug}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                        <ApprovalBadge status={asset.approvalStatus || 'pending'} onChange={s => setSceneApproval(key, s)} />
                        {!asset.localUrl && (
                          <button
                            onClick={() => onGenerateScene(ep.number, scene, ep.characters_in_episode || [])}
                            disabled={asset.status === 'generating'}
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', padding: '3px 7px', background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)', cursor: 'pointer', letterSpacing: '1px' }}
                          >
                            {asset.status === 'error' ? '↺' : '▶'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
