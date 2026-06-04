import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { series as seriesApi } from '../lib/api'

// ── Share panel shown below a card when toggled ────────────────────────────
function SharePanel({ item, onUpdate }) {
  const [busy, setBusy]   = useState(false)
  const [copied, setCopied] = useState(false)

  const shareUrl = item.shareToken
    ? `${window.location.origin}/?share=${item.shareToken}`
    : null

  async function handleShare() {
    setBusy(true)
    try {
      const res = await seriesApi.share(item._id)
      onUpdate({ shareToken: res.shareToken, isPublic: true })
    } catch (err) {
      console.warn('Share failed', err)
    } finally { setBusy(false) }
  }

  async function handleRevoke() {
    setBusy(true)
    try {
      await seriesApi.unshare(item._id)
      onUpdate({ shareToken: null, isPublic: false })
    } catch (err) {
      console.warn('Revoke failed', err)
    } finally { setBusy(false) }
  }

  function handleCopy() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ marginTop: '8px', padding: '10px 12px', background: '#0a0e14', border: '1px solid var(--border)' }}>
      {shareUrl ? (
        <>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--gold)', letterSpacing: '1.5px', marginBottom: '6px', textTransform: 'uppercase' }}>
            Public link active
          </div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <input
              readOnly
              value={shareUrl}
              aria-label="Public share URL"
              style={{ flex: 1, background: '#060810', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', padding: '5px 8px', outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onFocus={e => e.target.select()}
            />
            <button onClick={handleCopy} aria-label="Copy share link" style={actionBtn(copied ? '#3a7a4a' : 'var(--border)', copied ? '#6dc87a' : 'var(--muted)')}>
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
          <button onClick={handleRevoke} disabled={busy} aria-label="Revoke public link" style={{ ...actionBtn('#3a1818', '#804040'), width: '100%', fontSize: '9px', letterSpacing: '1px' }}>
            {busy ? '…' : 'Revoke Link'}
          </button>
        </>
      ) : (
        <>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '8px' }}>
            No public link — create one to share this series.
          </div>
          <button onClick={handleShare} disabled={busy} aria-label="Create public share link" style={{ ...actionBtn('var(--gold)', 'var(--gold)'), width: '100%', fontSize: '9px', letterSpacing: '1px' }}>
            {busy ? '…' : '+ Create Share Link'}
          </button>
        </>
      )}
    </div>
  )
}

function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch (_) { return iso }
}

function RenameInput({ value, onSave, onCancel }) {
  const [val, setVal] = useState(value)
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel() }}
        style={{ flex: 1, background: '#0a0806', border: '1px solid var(--gold)', color: 'var(--cream)', fontFamily: "'Cinzel', serif", fontSize: '14px', padding: '6px 10px', outline: 'none' }} />
      <button onClick={() => onSave(val)} style={actionBtn('var(--gold)', '#080b10')}>✓</button>
      <button onClick={onCancel} style={actionBtn('var(--border)', 'var(--muted)')}>×</button>
    </div>
  )
}
RenameInput.propTypes = { value: PropTypes.string.isRequired, onSave: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired }

export default function LibraryScreen({ onView, onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [renaming, setRenaming] = useState(null) // _id being renamed
  const [viewing, setViewing] = useState(null)   // _id currently being fetched for view
  const [sharing, setSharing] = useState(null)   // _id whose share panel is open

  useEffect(() => {
    seriesApi.list()
      .then(res => setItems(res.items))
      .catch(err => {
        console.warn('LibraryScreen: failed to load series', err)
        setError('Failed to load library. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleView(item) {
    if (viewing === item._id) return
    setViewing(item._id)
    try {
      const full = await seriesApi.get(item._id)
      onView(full.fullOutput, full._id)
    } catch (err) {
      console.warn('LibraryScreen: failed to fetch series', err)
      setError('Failed to load series. Please try again.')
    } finally {
      setViewing(null)
    }
  }

  async function handleDelete(id) {
    try {
      await seriesApi.delete(id)
      setItems(prev => prev.filter(i => i._id !== id))
    } catch (err) {
      console.warn('LibraryScreen: failed to delete series', err)
      setError('Failed to delete series. Please try again.')
    }
  }

  async function handleRename(id, newTitle) {
    try {
      await seriesApi.update(id, { title: newTitle })
      setItems(prev => prev.map(i => i._id === id ? { ...i, title: newTitle } : i))
      setRenaming(null)
    } catch (err) {
      console.warn('LibraryScreen: failed to rename series', err)
      setError('Failed to rename series. Please try again.')
    }
  }

  function handleShareUpdate(id, patch) {
    setItems(prev => prev.map(i => i._id === id ? { ...i, ...patch } : i))
  }

  async function handleDuplicate(item) {
    try {
      const copy = await seriesApi.duplicate(item._id)
      setItems(prev => [copy, ...prev])
    } catch (err) {
      console.warn('LibraryScreen: failed to duplicate series', err)
      setError('Failed to duplicate series. Please try again.')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '48px 24px' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
          <button onClick={onBack} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '2px', padding: '7px 14px', cursor: 'pointer' }}>
            ← Back
          </button>
          <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '28px', fontWeight: '600', color: 'var(--gold)' }}>My Library</h1>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--muted)' }}>{items.length} series</span>
        </div>

        {error && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#c04040', padding: '12px 16px', border: '1px solid #3a1818', marginBottom: '24px' }}>
            {error}
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--muted)', padding: '60px 0' }}>Loading...</div>}

        {!loading && items.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '80px 24px', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '40px', marginBottom: '20px', opacity: 0.3 }}>📚</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '22px', color: 'var(--muted)', marginBottom: '8px' }}>No series yet</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--border)' }}>Upload your first book to get started</div>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {items.map(item => (
              <div key={item._id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {/* Cover */}
                <div style={{ height: '130px', background: 'linear-gradient(135deg, #0e1219 0%, #1a1208 50%, #2a1808 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, opacity: 0.07, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(200,146,42,0.3) 2px, rgba(200,146,42,0.3) 3px)' }} />
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', letterSpacing: '3px', color: 'var(--gold)', textAlign: 'center', padding: '0 16px', opacity: 0.7, zIndex: 1 }}>{item.title}</div>
                </div>

                <div style={{ padding: '16px' }}>
                  {renaming === item._id ? (
                    <RenameInput value={item.title} onSave={v => handleRename(item._id, v)} onCancel={() => setRenaming(null)} />
                  ) : (
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '15px', color: 'var(--cream)', marginBottom: '4px', cursor: 'pointer' }} onDoubleClick={() => setRenaming(item._id)}>
                      {item.title}
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', marginLeft: '8px' }} title="Double-click to rename">✎</span>
                    </div>
                  )}
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--gold)', letterSpacing: '1px', marginBottom: '6px' }}>{item.author}</div>
                  {item.logline && (
                    <p style={{ fontStyle: 'italic', fontSize: '13px', color: 'var(--muted)', marginBottom: '10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.logline}</p>
                  )}
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#3a4a5a', letterSpacing: '1px', marginBottom: '12px' }}>{formatDate(item.updatedAt)}</div>

                  {/* Action buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <button onClick={() => handleView(item)} disabled={viewing === item._id} style={primaryBtn}>
                      {viewing === item._id ? '...' : 'View'}
                    </button>
                    <button onClick={() => handleDuplicate(item)} style={secondaryBtn} title="Duplicate series">⊕ Copy</button>
                    <button onClick={() => handleDelete(item._id)} style={dangerBtn}>Delete</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                    <button onClick={() => setRenaming(item._id)} style={secondaryBtn} aria-label={`Rename ${item.title}`}>✎ Rename</button>
                    <button
                      onClick={() => setSharing(sharing === item._id ? null : item._id)}
                      aria-label={`${sharing === item._id ? 'Close' : 'Open'} share panel for ${item.title}`}
                      aria-expanded={sharing === item._id}
                      style={{ ...secondaryBtn, color: item.isPublic ? 'var(--gold)' : 'var(--muted)', borderColor: item.isPublic ? 'var(--gold)' : 'var(--border)' }}
                    >
                      {item.isPublic ? '⬡ Shared' : '⬡ Share'}
                    </button>
                  </div>
                  {sharing === item._id && (
                    <SharePanel item={item} onUpdate={patch => handleShareUpdate(item._id, patch)} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

LibraryScreen.propTypes = { onView: PropTypes.func.isRequired, onBack: PropTypes.func.isRequired }

const primaryBtn = { background: 'var(--gold)', color: '#080b10', border: 'none', padding: '7px', fontFamily: "'Cinzel', serif", fontSize: '10px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer' }
const secondaryBtn = { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', padding: '7px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '1px', cursor: 'pointer' }
const dangerBtn = { background: 'transparent', color: '#804040', border: '1px solid #3a1818', padding: '7px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '1px', cursor: 'pointer' }
function actionBtn(border, color) { return { background: 'transparent', border: `1px solid ${border}`, color, padding: '4px 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', cursor: 'pointer' } }
