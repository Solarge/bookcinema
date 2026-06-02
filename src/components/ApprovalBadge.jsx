const STATUS_CONFIG = {
  pending:  { label: 'Pending',  color: '#4a5a6a', bg: '#141b24' },
  approved: { label: '✓ Approved', color: '#6dc87a', bg: '#0a2010' },
  flagged:  { label: '! Flagged', color: '#ffd166', bg: '#201800' },
  rejected: { label: '✗ Rejected', color: '#f08080', bg: '#200808' },
}

export default function ApprovalBadge({ status = 'pending', onChange }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  const options = Object.keys(STATUS_CONFIG).filter(s => s !== status)

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '9px',
        padding: '3px 8px',
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}44`,
      }}>{cfg.label}</span>
      {onChange && options.map(s => (
        <button key={s} onClick={() => onChange(s)} style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          padding: '2px 6px',
          border: `1px solid ${STATUS_CONFIG[s].color}44`,
          background: 'transparent',
          color: STATUS_CONFIG[s].color,
          cursor: 'pointer',
          letterSpacing: '1px',
        }}>
          {s === 'approved' ? '✓' : s === 'flagged' ? '!' : '✗'}
        </button>
      ))}
    </div>
  )
}
