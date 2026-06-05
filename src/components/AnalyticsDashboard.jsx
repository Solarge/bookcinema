import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { getAnalytics, exportAnalyticsCSV, clearAnalytics } from '../utils/analytics'
import { useDivModalA11y } from '../hooks/useModalA11y'
import '../styles/misc-components.css'

function StatCard({ label, value, sub }) {
  return (
    <div className="an-stat-card">
      <div className="an-stat-value">{value}</div>
      <div className="an-stat-label">{label}</div>
      {sub && <div className="an-stat-sub">{sub}</div>}
    </div>
  )
}
StatCard.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired, sub: PropTypes.string }

function DayRow({ session }) {
  const imgs   = session.events.filter(e => e.type === 'image').length
  const vids   = session.events.filter(e => e.type === 'video').length
  const voices = session.events.filter(e => e.type === 'voice').length
  const cost   = session.events.reduce((a, e) => a + (e.costUsd ?? 0), 0)
  return (
    <div className="an-day-row">
      <span className="an-day-date">{session.date}</span>
      <span style={{ color: 'var(--char-protagonist)' }}>🖼 {imgs}</span>
      <span style={{ color: 'var(--char-love)' }}>🎬 {vids}</span>
      <span style={{ color: 'var(--char-ally)' }}>🎙 {voices}</span>
      <span style={{ color: 'var(--gold)', marginLeft: 'auto' }}>${cost.toFixed(4)}</span>
    </div>
  )
}
DayRow.propTypes = { session: PropTypes.object.isRequired }

export default function AnalyticsDashboard({ onClose }) {
  const [data, setData] = useState(null)
  const panelRef = useRef(null)
  useDivModalA11y(onClose, panelRef)

  useEffect(() => { setData(getAnalytics()) }, [])

  if (!data) return null

  const recent = [...data.sessions].reverse().slice(0, 30)

  return (
    <div className="an-overlay" onClick={onClose} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClose()} role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-modal-title"
        className="an-dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="an-header">
          <span id="analytics-modal-title" className="an-title">ANALYTICS</span>
          <div className="an-header-actions">
            <button onClick={exportAnalyticsCSV} className="an-export-btn">⬇ Export CSV</button>
            <button onClick={() => { clearAnalytics(); setData(getAnalytics()) }} className="an-clear-btn">Clear</button>
            <button onClick={onClose} aria-label="Close analytics dialog" className="an-close-btn">×</button>
          </div>
        </div>

        <div className="an-body">
          {/* Totals */}
          <div className="an-stats-grid">
            <StatCard label="Series" value={data.totals.seriesGenerated ?? 0} />
            <StatCard label="Images" value={data.totals.images ?? 0} />
            <StatCard label="Videos" value={data.totals.videos ?? 0} />
            <StatCard label="Voice" value={data.totals.voice ?? 0} />
            <StatCard label="Total Spent" value={`$${(data.totals.costUsd ?? 0).toFixed(3)}`} sub="all time" />
          </div>

          {/* Day-by-day */}
          <div className="an-activity-heading">RECENT ACTIVITY</div>
          {recent.length === 0
            ? <div className="an-no-activity">No activity recorded yet</div>
            : recent.map(s => <DayRow key={s.date} session={s} />)
          }
        </div>
      </div>
    </div>
  )
}

AnalyticsDashboard.propTypes = { onClose: PropTypes.func.isRequired }
