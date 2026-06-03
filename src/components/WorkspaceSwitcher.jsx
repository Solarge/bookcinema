import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { workspaces as workspacesApi } from '../lib/api'

const TYPE_ICON = { personal: '👤', organization: '🏢' }

export default function WorkspaceSwitcher() {
  const { activeWorkspace, switchWorkspace } = useAuth()
  const [list, setList]         = useState([])
  const [error, setError]       = useState(false)
  const [open, setOpen]         = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    workspacesApi.list()
      .then(data => setList(Array.isArray(data) ? data : []))
      .catch(() => setError(true))
  }, [])

  const current = list.find(ws => ws._id === activeWorkspace)

  const handleSelect = useCallback(async (ws) => {
    if (ws._id === activeWorkspace || switching) return
    setSwitching(true)
    try {
      await switchWorkspace(ws._id)
    } finally {
      setSwitching(false)
      setOpen(false)
    }
  }, [activeWorkspace, switchWorkspace, switching])

  if (error) {
    return (
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '10px',
        color: 'var(--muted)',
        letterSpacing: '1px',
        opacity: 0.5,
      }}>
        workspace unavailable
      </span>
    )
  }

  const label = current
    ? `${TYPE_ICON[current.type] ?? '🏢'} ${current.name}`
    : 'Workspace'

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        disabled={switching}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          padding: '6px 12px',
          cursor: switching ? 'wait' : 'pointer',
          letterSpacing: '1px',
          opacity: switching ? 0.6 : 1,
        }}
      >
        {label}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          zIndex: 200,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          minWidth: '180px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {list.length === 0 && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: 'var(--muted)',
              padding: '10px 14px',
              letterSpacing: '1px',
            }}>
              no workspaces
            </div>
          )}
          {list.map(ws => {
            const isActive = ws._id === activeWorkspace
            return (
              <button
                key={ws._id}
                onClick={() => handleSelect(ws)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  color: isActive ? 'var(--gold)' : 'var(--cream)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '10px',
                  padding: '9px 14px',
                  cursor: isActive ? 'default' : 'pointer',
                  letterSpacing: '1px',
                  textAlign: 'left',
                  gap: '8px',
                }}
              >
                <span>{TYPE_ICON[ws.type] ?? '🏢'} {ws.name}</span>
                {isActive && <span style={{ color: 'var(--gold)', fontSize: '11px' }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
