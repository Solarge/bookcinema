import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { admin as adminApi } from '../../lib/api'

// ── Shared style helpers ────────────────────────────────────────────────────
const mono = (size = '11px', color = 'var(--cream)') => ({
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: size,
  color,
})
const cinzel = (size = '13px', color = 'var(--gold)') => ({
  fontFamily: "'Cinzel', serif",
  fontSize: size,
  color,
  letterSpacing: '1.5px',
})
const sectionLabel = {
  ...mono('9px', 'var(--muted)'),
  letterSpacing: '2px',
  textTransform: 'uppercase',
  marginBottom: '12px',
}
const card = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  padding: '14px',
  textAlign: 'center',
}
const input = {
  background: '#0a0806',
  border: '1px solid var(--border)',
  color: 'var(--cream)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  padding: '9px 12px',
  outline: 'none',
  boxSizing: 'border-box',
}
const btn = (variant = 'primary', disabled = false) => {
  const base = {
    fontFamily: "'Cinzel', serif",
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    padding: '8px 16px',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
  if (disabled) return { ...base, background: 'var(--border)', color: 'var(--muted)' }
  if (variant === 'danger')   return { ...base, background: 'transparent', color: '#f08080', border: '1px solid #804040' }
  if (variant === 'ghost')    return { ...base, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }
  if (variant === 'warning')  return { ...base, background: 'transparent', color: '#f0a050', border: '1px solid #805030' }
  return { ...base, background: 'var(--gold)', color: '#080b10' }
}
const divider = { borderTop: '1px solid var(--border)', marginTop: '24px', paddingTop: '20px' }
const smallMuted = { ...mono('9px', 'var(--muted)'), letterSpacing: '1px' }

// ── Platform Stats ──────────────────────────────────────────────────────────
function PlatformStats({ onMsg }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await adminApi.stats()
        if (!cancelled) setStats(data)
      } catch (err) {
        if (!cancelled) onMsg(`Stats error: ${err.message}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [onMsg])

  if (loading) return <div style={mono('10px', 'var(--muted)')}>Loading stats…</div>
  if (!stats)  return null

  const statCards = [
    ['Total Users',     stats.users        ?? 0,                          'users'],
    ['Total Series',    stats.series       ?? 0,                          'series'],
    ['Platform Spend',  `$${(stats.totalCostUsd ?? 0).toFixed(3)}`,       'cost-usd'],
  ]

  return (
    <div>
      <div style={sectionLabel}>Platform Overview</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '8px' }}>
        {statCards.map(([label, value]) => (
          <div key={label} style={card}>
            <div style={cinzel('24px')}>{value}</div>
            <div style={{ ...smallMuted, marginTop: '5px' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
PlatformStats.propTypes = { onMsg: PropTypes.func.isRequired }

// ── User Row ────────────────────────────────────────────────────────────────
function UserRow({ user, onMsg, onRefresh }) {
  const [credits, setCredits]   = useState('')
  const [plan, setPlan]         = useState(user.plan || 'free')
  const [role, setRole]         = useState(user.role || 'user')
  const [busy, setBusy]         = useState(false)

  async function handleSetCredits() {
    const amount = Number(credits)
    if (!Number.isFinite(amount)) return onMsg('Credits must be a number')
    setBusy(true)
    try {
      const r = await adminApi.setCredits(user._id, amount, amount >= 0 ? 'add' : 'set')
      onMsg(`Credits updated — new balance: ${r.balance}`)
      setCredits('')
      if (onRefresh) onRefresh()
    } catch (err) { onMsg(`Credits error (${user.email}): ${err.message}`) }
    finally { setBusy(false) }
  }

  async function handleSetPlan() {
    setBusy(true)
    try {
      const r = await adminApi.setPlan(user._id, { plan, role })
      onMsg(`Plan/role updated → ${r.workspacePlan ?? plan} / ${r.role ?? role}`)
      if (onRefresh) onRefresh()
    } catch (err) { onMsg(`Plan error (${user.email}): ${err.message}`) }
    finally { setBusy(false) }
  }

  async function handleDeactivate() {
    if (!window.confirm(`Deactivate ${user.email}? This will prevent them from logging in.`)) return
    setBusy(true)
    try {
      const r = await adminApi.deactivate(user._id)
      onMsg(r.message || `User ${user.email} deactivated`)
      if (onRefresh) onRefresh()
    } catch (err) { onMsg(`Deactivate error (${user.email}): ${err.message}`) }
    finally { setBusy(false) }
  }

  const rowBase = {
    borderBottom: '1px solid var(--border)',
    paddingBottom: '14px',
    marginBottom: '14px',
  }
  const inactive = !user.isActive

  return (
    <div style={rowBase}>
      {/* Identity line */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <span style={mono('12px', inactive ? 'var(--muted)' : 'var(--cream)')}>{user.name || '(no name)'}</span>
        <span style={smallMuted}>{user.email}</span>
        <span style={{ ...mono('9px', user.role === 'admin' ? 'var(--gold)' : 'var(--muted)'), letterSpacing: '1px', textTransform: 'uppercase' }}>{user.role}</span>
        <span style={{ ...mono('9px', '#6dc87a'), letterSpacing: '1px', textTransform: 'uppercase' }}>{user.plan || 'free'}</span>
        {inactive && <span style={{ ...mono('9px', '#f08080'), letterSpacing: '1px', textTransform: 'uppercase' }}>INACTIVE</span>}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Credits */}
        <input
          type="number"
          placeholder="Credits"
          value={credits}
          onChange={e => setCredits(e.target.value)}
          aria-label={`Grant credits to ${user.email}`}
          style={{ ...input, width: '80px', padding: '6px 8px' }}
        />
        <button onClick={handleSetCredits} disabled={busy || credits === ''} style={btn('primary', busy || credits === '')} aria-label={`Apply credit amount to ${user.email}`}>Grant</button>

        {/* Plan */}
        <select
          value={plan}
          onChange={e => setPlan(e.target.value)}
          aria-label={`Set plan for ${user.email}`}
          style={{ ...input, padding: '6px 8px', cursor: 'pointer' }}
        >
          <option value="free">free</option>
          <option value="pro">pro</option>
          <option value="studio">studio</option>
        </select>

        {/* Role */}
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          aria-label={`Set role for ${user.email}`}
          style={{ ...input, padding: '6px 8px', cursor: 'pointer' }}
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>

        <button onClick={handleSetPlan} disabled={busy} style={btn('ghost', busy)} aria-label={`Apply plan and role to ${user.email}`}>Apply</button>

        {/* Deactivate */}
        {user.isActive !== false && (
          <button onClick={handleDeactivate} disabled={busy} style={btn('danger', busy)} aria-label={`Deactivate account for ${user.email}`}>Deactivate</button>
        )}
      </div>
    </div>
  )
}
UserRow.propTypes = {
  user:      PropTypes.object.isRequired,
  onMsg:     PropTypes.func.isRequired,
  onRefresh: PropTypes.func,
}

// ── User Management ─────────────────────────────────────────────────────────
function UserManagement({ onMsg }) {
  const [query, setQuery]       = useState('')
  const [users, setUsers]       = useState(null)
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const debounceRef             = useRef(null)

  async function search(q) {
    setLoading(true)
    try {
      const params = q ? { search: q } : {}
      const data = await adminApi.users(params)
      setUsers(data.users)
      setTotal(data.total)
    } catch (err) { onMsg(`User search error: ${err.message}`) }
    finally { setLoading(false) }
  }

  // Load initial list on mount
  useEffect(() => {
    search('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleQueryChange(e) {
    const q = e.target.value
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 400)
  }

  return (
    <div style={divider}>
      <div style={sectionLabel}>User Management</div>

      {/* Search */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search by name or email…"
          value={query}
          onChange={handleQueryChange}
          aria-label="Search users by name or email"
          style={{ ...input, flex: 1 }}
        />
        <button onClick={() => search(query)} disabled={loading} style={btn('ghost', loading)} aria-label="Run user search">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Result count */}
      {users !== null && (
        <div style={{ ...smallMuted, marginBottom: '12px' }}>
          {total} user{total !== 1 ? 's' : ''}{total > users.length ? ` (showing ${users.length})` : ''}
        </div>
      )}

      {/* User list */}
      {loading && users === null && <div style={mono('10px', 'var(--muted)')}>Loading…</div>}
      {users !== null && users.length === 0 && (
        <div style={mono('10px', 'var(--muted)')}>No users found.</div>
      )}
      {users !== null && users.map(u => (
        <UserRow key={u._id} user={u} onMsg={onMsg} onRefresh={() => search(query)} />
      ))}
    </div>
  )
}
UserManagement.propTypes = { onMsg: PropTypes.func.isRequired }

// ── Managed Access + Workspace Credits ─────────────────────────────────────
function ManagedAccessPanel({ onMsg }) {
  const [wsId, setWsId]               = useState('')
  const [wsCredits, setWsCredits]     = useState('')
  const [wsCreditsNote, setWsCreditsNote] = useState('')
  const [busy, setBusy]               = useState(false)

  async function handleEnable(enabled) {
    const id = wsId.trim()
    if (!id) return onMsg('Workspace ID is required')
    setBusy(true)
    try {
      const r = await adminApi.setManagedAccess(id, enabled)
      onMsg(`Managed generation ${r.managedBeta ? 'ENABLED' : 'DISABLED'} for workspace ${r.workspaceId}`)
    } catch (err) { onMsg(`Managed access error: ${err.message}`) }
    finally { setBusy(false) }
  }

  async function handleGrantCredits() {
    const id = wsId.trim()
    if (!id) return onMsg('Workspace ID is required')
    const amount = Number(wsCredits)
    if (!Number.isFinite(amount) || amount === 0) return onMsg('Amount must be a non-zero number')
    setBusy(true)
    try {
      const r = await adminApi.grantWorkspaceCredits(id, amount, wsCreditsNote || undefined)
      onMsg(`Credits updated — new balance: ${r.balance} (workspace ${r.workspaceId})`)
      setWsCredits('')
      setWsCreditsNote('')
    } catch (err) { onMsg(`Workspace credits error: ${err.message}`) }
    finally { setBusy(false) }
  }

  return (
    <div style={divider}>
      <div style={sectionLabel}>Workspace Controls</div>
      <div style={mono('10px', 'var(--muted)')}>
        Grant/revoke managed-generation beta access and adjust credits for any workspace by ID.
      </div>

      {/* Workspace ID input */}
      <div style={{ marginTop: '14px', marginBottom: '10px' }}>
        <div style={{ ...sectionLabel, marginBottom: '5px' }}>Workspace ID</div>
        <input
          type="text"
          placeholder="MongoDB ObjectId"
          value={wsId}
          onChange={e => setWsId(e.target.value)}
          aria-label="Workspace ID for admin operations"
          style={{ ...input, width: '100%' }}
        />
      </div>

      {/* Managed access toggles */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ ...sectionLabel, marginBottom: '8px' }}>Managed Generation Access</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => handleEnable(true)}  disabled={busy} style={btn('primary', busy)} aria-label="Enable managed generation for workspace">Enable</button>
          <button onClick={() => handleEnable(false)} disabled={busy} style={btn('danger',  busy)} aria-label="Disable managed generation for workspace">Disable</button>
        </div>
      </div>

      {/* Workspace credit grant */}
      <div>
        <div style={{ ...sectionLabel, marginBottom: '8px' }}>Grant / Deduct Credits</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <input
            type="number"
            placeholder="Amount (neg to deduct)"
            value={wsCredits}
            onChange={e => setWsCredits(e.target.value)}
            aria-label="Credit amount to grant or deduct (negative to deduct)"
            style={{ ...input, width: '180px' }}
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={wsCreditsNote}
            onChange={e => setWsCreditsNote(e.target.value)}
            aria-label="Optional note for this credit adjustment"
            style={{ ...input, flex: 1 }}
          />
          <button onClick={handleGrantCredits} disabled={busy || wsCredits === ''} style={btn('primary', busy || wsCredits === '')} aria-label="Apply workspace credit change">Apply</button>
        </div>
        <div style={smallMuted}>Use negative values to deduct credits.</div>
      </div>
    </div>
  )
}
ManagedAccessPanel.propTypes = { onMsg: PropTypes.func.isRequired }

// ── AdminPanel (composed) ───────────────────────────────────────────────────
export default function AdminPanel({ onMsg }) {
  return (
    <div>
      {/* Red banner marking the admin zone */}
      <div style={{
        background: 'rgba(120,20,20,0.25)',
        border: '1px solid #804040',
        padding: '8px 12px',
        marginBottom: '20px',
        ...mono('9px', '#f08080'),
        letterSpacing: '2px',
        textTransform: 'uppercase',
      }} role="note" aria-label="Admin-only zone warning">
        Admin Zone — changes take effect immediately. No undo.
      </div>

      <PlatformStats onMsg={onMsg} />
      <UserManagement onMsg={onMsg} />
      <ManagedAccessPanel onMsg={onMsg} />
    </div>
  )
}
AdminPanel.propTypes = { onMsg: PropTypes.func.isRequired }
