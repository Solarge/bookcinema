import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { getAnalytics, exportAnalyticsCSV, clearAnalytics } from '../utils/analytics'

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '16px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '28px', color: 'var(--gold)', marginBottom: '4px' }}>{value}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase' }}>{label}</div>
      {sub && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#4a5a6a', marginTop: '2px' }}>{sub}</div>}
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
    <div style={{ display: 'flex', gap: '16px', padding: '10px 0', borderBottom: '1px solid var(--border)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>
      <span style={{ color: 'var(--muted)', width: '100px', flexShrink: 0 }}>{session.date}</span>
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

  useEffect(() => { setData(getAnalytics()) }, [])

  if (!data) return null

  const recent = [...data.sessions].reverse().slice(0, 30)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold)', letterSpacing: '3px' }}>ANALYTICS</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={exportAnalyticsCSV} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', padding: '6px 12px', background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)', cursor: 'pointer', letterSpacing: '1px' }}>
              ⬇ Export CSV
            </button>
            <button onClick={() => { clearAnalytics(); setData(getAnalytics()) }} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', padding: '6px 12px', background: 'transparent', border: '1px solid #804040', color: '#f08080', cursor: 'pointer', letterSpacing: '1px' }}>
              Clear
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px', marginBottom: '28px' }}>
            <StatCard label="Series" value={data.totals.seriesGenerated ?? 0} />
            <StatCard label="Images" value={data.totals.images ?? 0} />
            <StatCard label="Videos" value={data.totals.videos ?? 0} />
            <StatCard label="Voice" value={data.totals.voice ?? 0} />
            <StatCard label="Total Spent" value={`$${(data.totals.costUsd ?? 0).toFixed(3)}`} sub="all time" />
          </div>

          {/* Day-by-day */}
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', letterSpacing: '3px', color: 'var(--gold)', marginBottom: '12px' }}>RECENT ACTIVITY</div>
          {recent.length === 0 ? (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--muted)', textAlign: 'center', padding: '32px' }}>No activity recorded yet</div>
          ) : (
            recent.map(s => <DayRow key={s.date} session={s} />)
          )}
        </div>
      </div>
    </div>
  )
}

AnalyticsDashboard.propTypes = { onClose: PropTypes.func.isRequired }
