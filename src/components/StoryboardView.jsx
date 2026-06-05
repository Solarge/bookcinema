import { useMedia } from '../contexts/MediaContext'
import ApprovalBadge from './ApprovalBadge'
import '../styles/storyboard.css'

const STATUS_COLORS = { idle: '#3a4a5a', generating: '#c8922a', done: '#6dc87a', error: '#f08080' }

export default function StoryboardView({ series, onClose, onGenerateScene }) {
  const { scenes, setSceneApproval } = useMedia()

  return (
    <div className="sb-overlay">
      <div className="sb-inner">
        {/* Header */}
        <div className="sb-header">
          <div>
            <div className="sb-header__title">Storyboard</div>
            <div className="sb-header__series">{series.title}</div>
          </div>
          <button onClick={onClose} className="sb-back-btn">← Back to Script</button>
        </div>

        {(series.episodes || []).map(ep => (
          <div key={ep.number} className="sb-episode">
            {/* Episode row header */}
            <div className="sb-episode__heading">
              EP {ep.number} — {ep.title}
            </div>

            {/* Scene grid */}
            <div className="sb-scene-grid">
              {(ep.scenes || []).map(scene => {
                const key = `ep${ep.number}-s${scene.scene_number}`
                const asset = scenes[key] ?? {}
                const statusColor = STATUS_COLORS[asset.status || 'idle']

                return (
                  <div key={key} className="sb-scene" style={{ border: `1px solid ${statusColor}55` }}>
                    {/* Thumbnail / video */}
                    <div className="sb-scene__thumb">
                      {asset.localUrl ? (
                        <video src={asset.localUrl} className="sb-scene__thumb-video" muted />
                      ) : (
                        <div className="sb-scene__thumb-empty">
                          <div className="sb-scene__status-dot" style={{ background: statusColor }} />
                          <span className="sb-scene__status-label" style={{ color: statusColor }}>
                            {asset.status === 'generating' ? 'Generating…' : asset.status === 'error' ? 'Error' : 'No Video'}
                          </span>
                        </div>
                      )}
                      <div className="sb-scene__badge">S{scene.scene_number}</div>
                    </div>

                    <div className="sb-scene__info">
                      <div className="sb-scene__slug">{scene.slug}</div>
                      <div className="sb-scene__actions">
                        <ApprovalBadge status={asset.approvalStatus || 'pending'} onChange={s => setSceneApproval(key, s)} />
                        {!asset.localUrl && (
                          <button
                            onClick={() => onGenerateScene(ep.number, scene, ep.characters_in_episode || [])}
                            disabled={asset.status === 'generating'}
                            className="sb-scene__gen-btn"
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
