import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { workspaces as workspacesApi } from '../lib/api'
import '../styles/misc-components.css'

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
    return <span className="wsw-error">workspace unavailable</span>
  }

  const label = current
    ? `${TYPE_ICON[current.type] ?? '🏢'} ${current.name}`
    : 'Workspace'

  return (
    <div className="wsw-wrap">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        disabled={switching}
        className="wsw-trigger"
      >
        {label}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="wsw-dropdown">
          {list.length === 0 && (
            <div className="wsw-empty">no workspaces</div>
          )}
          {list.map(ws => {
            const isActive = ws._id === activeWorkspace
            return (
              <button
                key={ws._id}
                onClick={() => handleSelect(ws)}
                className={`wsw-item${isActive ? ' wsw-item--active' : ''}`}
              >
                <span>{TYPE_ICON[ws.type] ?? '🏢'} {ws.name}</span>
                {isActive && <span className="wsw-item__check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
