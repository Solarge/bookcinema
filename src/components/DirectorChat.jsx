import { useState, useRef, useEffect } from 'react'
import { managed as managedApi, pollJob } from '../lib/api'
import '../styles/director-chat.css'

// Quick-start prompts that prefill the input.
const SUGGESTIONS = [
  'Why this many episodes?',
  'Make the episodes longer',
  'Make it funnier',
  'Add a villain',
  'Make episode 1 more dramatic',
]

/**
 * Director's Chat — ask questions about, or request revisions to, a series.
 * The managed backend replies with a JSON envelope:
 *   { mode: 'answer'|'revise', answer?: string, series?: {full updated series} }
 *
 * Props:
 *   series         — current series JSON (sent as context)
 *   onSeriesUpdate — called with the full updated series when mode === 'revise'
 *   tier           — managed tier ('standard' | 'premium')
 */
export default function DirectorChat({ series, onSeriesUpdate, tier, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  async function handleSubmit(e) {
    e?.preventDefault?.()
    const instruction = input.trim()
    if (!instruction || busy) return

    setMessages(prev => [...prev, { role: 'user', text: instruction }])
    setInput('')
    setBusy(true)
    setError(null)

    try {
      const { jobId } = await managedApi.refine({ instruction, currentSeries: series, tier: tier || 'standard' })
      const job = await pollJob(jobId)
      if (job.status !== 'done') throw new Error(job.errorMessage || 'Refine job failed')

      let envelope
      try {
        envelope = JSON.parse(job.result?.text ?? '')
      } catch (parseErr) {
        throw new Error('Could not parse the response', { cause: parseErr })
      }

      if (envelope.mode === 'answer') {
        setMessages(prev => [...prev, { role: 'assistant', text: envelope.answer || '(no answer)' }])
      } else if (envelope.mode === 'revise' && envelope.series) {
        setMessages(prev => [...prev, { role: 'assistant', text: '✓ Updated your series.' }])
        onSeriesUpdate(envelope.series)
      } else {
        throw new Error('Unexpected response shape')
      }
    } catch (err) {
      console.error('[DirectorChat] refine failed:', err)
      setError(err.message || 'Request failed')
      setMessages(prev => [...prev, { role: 'system', text: "Sorry, I couldn't process that — try rephrasing." }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dc-panel" role="dialog" aria-label="Director's Chat">
      <div className="dc-header">
        <div>
          <span className="dc-header-title">💬 Director&apos;s Chat</span>
          <span className="dc-header-sub">Ask about or revise your series</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="dc-close-btn" aria-label="Close Director's Chat">×</button>
        )}
      </div>

      <div className="dc-messages" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <p className="dc-empty">
            Ask me anything about your series — or tell me how to change it.
            Try a suggestion below to get started.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`dc-msg dc-msg--${m.role}`}>{m.text}</div>
        ))}
        {busy && <div className="dc-thinking" aria-live="polite">thinking…</div>}
      </div>

      <div className="dc-chips">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            type="button"
            className="dc-chip"
            disabled={busy}
            onClick={() => setInput(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <form className="dc-input-row" onSubmit={handleSubmit}>
        <textarea
          className="dc-input"
          rows={2}
          value={input}
          disabled={busy}
          placeholder="e.g. make episode 2 darker"
          aria-label="Message the director"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }}
        />
        <button type="submit" className="dc-send-btn" disabled={busy || !input.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </div>
  )
}
