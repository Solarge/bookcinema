// Cross-session analytics stored in localStorage
const KEY = 'bookfilm:analytics'

function loadData() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? { sessions: [], totals: { images: 0, videos: 0, voice: 0, costUsd: 0, seriesGenerated: 0 } }
  } catch (_) { return { sessions: [], totals: { images: 0, videos: 0, voice: 0, costUsd: 0, seriesGenerated: 0 } } }
}

function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch (_) {}
}

export function recordGeneration(type, provider, quality, costUsd) {
  const data = loadData()
  const today = new Date().toISOString().split('T')[0]
  let session = data.sessions.find(s => s.date === today)
  if (!session) { session = { date: today, events: [] }; data.sessions.push(session) }
  session.events.push({ type, provider, quality, costUsd, ts: Date.now() })
  data.totals[type === 'image' ? 'images' : type === 'video' ? 'videos' : 'voice'] = (data.totals[type === 'image' ? 'images' : type === 'video' ? 'videos' : 'voice'] ?? 0) + 1
  data.totals.costUsd = (data.totals.costUsd ?? 0) + (costUsd ?? 0)
  save(data)
}

export function recordSeriesGeneration(textProvider) {
  const data = loadData()
  const today = new Date().toISOString().split('T')[0]
  let session = data.sessions.find(s => s.date === today)
  if (!session) { session = { date: today, events: [] }; data.sessions.push(session) }
  session.events.push({ type: 'series', provider: textProvider, ts: Date.now() })
  data.totals.seriesGenerated = (data.totals.seriesGenerated ?? 0) + 1
  save(data)
}

export function getAnalytics() { return loadData() }

export function exportAnalyticsCSV() {
  const data = loadData()
  const rows = [['Date', 'Type', 'Provider', 'Quality', 'Cost (USD)']]
  for (const session of data.sessions) {
    for (const e of session.events) {
      rows.push([session.date, e.type, e.provider ?? '', e.quality ?? '', (e.costUsd ?? 0).toFixed(6)])
    }
  }
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `bookfilm-analytics-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
}

export function clearAnalytics() {
  try { localStorage.removeItem(KEY) } catch (_) {}
}
