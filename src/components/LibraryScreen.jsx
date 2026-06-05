import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { series as seriesApi } from '../lib/api'
import '../styles/library.css'

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
    <div className="lib-share-panel">
      {shareUrl ? (
        <>
          <div className="lib-share-active-label">Public link active</div>
          <div className="lib-share-url-row">
            <input
              readOnly
              value={shareUrl}
              aria-label="Public share URL"
              className="lib-share-url-input"
              onFocus={e => e.target.select()}
            />
            <button
              onClick={handleCopy}
              aria-label="Copy share link"
              className={`lib-share-copy-btn${copied ? ' is-copied' : ''}`}
            >
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
          <button
            onClick={handleRevoke}
            disabled={busy}
            aria-label="Revoke public link"
            className="lib-share-revoke-btn"
          >
            {busy ? '…' : 'Revoke Link'}
          </button>
        </>
      ) : (
        <>
          <div className="lib-share-no-link-hint">
            No public link — create one to share this series.
          </div>
          <button
            onClick={handleShare}
            disabled={busy}
            aria-label="Create public share link"
            className="lib-share-create-btn"
          >
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
    <div className="lib-rename-row">
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel() }}
        className="lib-rename-input"
      />
      <button onClick={() => onSave(val)} className="lib-rename-confirm">✓</button>
      <button onClick={onCancel} className="lib-rename-cancel">×</button>
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
  const [search, setSearch]   = useState('')
  const [searching, setSearching] = useState(false)

  function loadLibrary(q) {
    const params = q ? { search: q } : {}
    return seriesApi.list(params)
      .then(res => setItems(res.items))
      .catch(err => {
        console.warn('LibraryScreen: failed to load series', err)
        setError('Failed to load library. Please try again.')
      })
      .finally(() => { setLoading(false); setSearching(false) })
  }

  useEffect(() => {
    loadLibrary('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(q) {
    setSearch(q)
    setSearching(true)
    setError(null)
    loadLibrary(q)
  }

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
    <div className="lib-screen">
      <div className="lib-inner">

        <div className="lib-header">
          <button onClick={onBack} className="lib-back-btn">← Back</button>
          <h1 className="lib-title">My Library</h1>
          <span className="lib-count">{items.length} series</span>
          <div className="lib-search-row">
            <label htmlFor="library-search" className="lib-sr-only">Search library</label>
            <input
              id="library-search"
              type="search"
              placeholder="Search series…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              aria-label="Search series by title or author"
              className="lib-search-input"
            />
            {searching && (
              <span
                className="lib-searching-indicator"
                aria-live="polite"
                aria-label="Searching"
              >…</span>
            )}
          </div>
        </div>

        {error && (
          <div className="lib-error">{error}</div>
        )}

        {loading && (
          <div className="lib-loading">Loading...</div>
        )}

        {!loading && items.length === 0 && !error && (
          <div className="lib-empty">
            <div className="lib-empty-icon">📚</div>
            <div className="lib-empty-title">No series yet</div>
            <div className="lib-empty-hint">Upload your first book to get started</div>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="lib-grid">
            {items.map(item => (
              <div key={item._id} className="lib-card">
                {/* Cover */}
                <div className="lib-card-cover">
                  <div className="lib-card-cover-lines" />
                  <div className="lib-card-cover-title">{item.title}</div>
                </div>

                <div className="lib-card-body">
                  {renaming === item._id ? (
                    <RenameInput value={item.title} onSave={v => handleRename(item._id, v)} onCancel={() => setRenaming(null)} />
                  ) : (
                    <div className="lib-card-title" onDoubleClick={() => setRenaming(item._id)}>
                      {item.title}
                      <span className="lib-card-rename-icon" title="Double-click to rename">✎</span>
                    </div>
                  )}
                  <div className="lib-card-author">{item.author}</div>
                  {item.logline && (
                    <p className="lib-card-logline">{item.logline}</p>
                  )}
                  <div className="lib-card-date">{formatDate(item.updatedAt)}</div>

                  {/* Action buttons */}
                  <div className="lib-actions-3">
                    <button onClick={() => handleView(item)} disabled={viewing === item._id} className="lib-btn-primary">
                      {viewing === item._id ? '...' : 'View'}
                    </button>
                    <button onClick={() => handleDuplicate(item)} className="lib-btn-secondary" title="Duplicate series">⊕ Copy</button>
                    <button onClick={() => handleDelete(item._id)} className="lib-btn-danger">Delete</button>
                  </div>
                  <div className="lib-actions-2">
                    <button onClick={() => setRenaming(item._id)} className="lib-btn-secondary" aria-label={`Rename ${item.title}`}>✎ Rename</button>
                    <button
                      onClick={() => setSharing(sharing === item._id ? null : item._id)}
                      aria-label={`${sharing === item._id ? 'Close' : 'Open'} share panel for ${item.title}`}
                      aria-expanded={sharing === item._id}
                      className={`lib-btn-secondary${item.isPublic ? ' lib-btn-share-active' : ''}`}
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
