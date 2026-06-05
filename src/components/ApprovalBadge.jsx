import PropTypes from 'prop-types'
import '../styles/misc-components.css'

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
    <div className="ab-row">
      <span
        className="ab-badge"
        style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}44` }}
      >{cfg.label}</span>
      {onChange && options.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          aria-label={`Mark as ${s}`}
          className="ab-action-btn"
          style={{ border: `1px solid ${STATUS_CONFIG[s].color}44`, color: STATUS_CONFIG[s].color }}
        >
          {s === 'approved' ? '✓' : s === 'flagged' ? '!' : '✗'}
        </button>
      ))}
    </div>
  )
}

ApprovalBadge.propTypes = {
  status:   PropTypes.oneOf(['pending', 'approved', 'flagged', 'rejected']),
  onChange: PropTypes.func,
}
