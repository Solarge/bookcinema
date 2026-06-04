import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

const MESSAGES = [
  'Absorbing the story...',
  'Mapping the characters...',
  'Writing Episode 1...',
  'Crafting the dialogue...',
  'Generating Kling prompts...',
  'Building the character bible...',
  'Finalising your series...',
]

/**
 * LoadingScreen
 *
 * Props (all optional — works fine with none):
 *   progress  {number}  0-100  — when provided by a managed-job poller, reflects real
 *                                 job progress.  Otherwise the bar animates indeterminately
 *                                 and caps at 90% until the caller unmounts the screen.
 *   status    {string}         — short status text from the job (e.g. "Generating episode 4…").
 *                                 When provided, replaces the rotating MESSAGES copy.
 */
export default function LoadingScreen({ progress: externalProgress, status: externalStatus }) {
  const [msgIndex, setMsgIndex]       = useState(0)
  const [fakeProgress, setFakeProgress] = useState(5)
  const [slowWarning, setSlowWarning]   = useState(false)
  const startRef = useRef(Date.now())

  // Rotate through canned messages (only when no external status is given)
  useEffect(() => {
    if (externalStatus) return
    const t = setInterval(() => setMsgIndex(i => (i + 1) % MESSAGES.length), 3000)
    return () => clearInterval(t)
  }, [externalStatus])

  // Fake progress animation (only used when no external progress is given)
  useEffect(() => {
    if (externalProgress != null) return
    const t = setInterval(() => {
      setFakeProgress(p => {
        if (p >= 90) return p
        return p + Math.random() * 8 + 2
      })
    }, 2000)
    return () => clearInterval(t)
  }, [externalProgress])

  // "Still working…" warning after 30 s of fake-progress being stuck near 90%
  useEffect(() => {
    if (externalProgress != null) return // not needed when we have real progress
    const t = setTimeout(() => {
      if (Date.now() - startRef.current >= 30000) setSlowWarning(true)
    }, 30000)
    return () => clearTimeout(t)
  }, [externalProgress])

  const displayProgress = externalProgress != null
    ? Math.min(Math.max(externalProgress, 0), 100)
    : Math.min(fakeProgress, 90)

  const displayMessage = externalStatus || MESSAGES[msgIndex]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
    }}>

      {/* Film reel */}
      <div style={{ position: 'relative', marginBottom: '48px' }}>
        {/* Outer ring */}
        <div
          className="animate-spin-reel"
          style={{
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            border: '2px solid var(--gold)',
            borderTopColor: 'transparent',
            borderRightColor: 'transparent',
            position: 'relative',
          }}
        >
          {/* Sprocket holes */}
          {[0, 60, 120, 180, 240, 300].map(deg => (
            <div key={deg} style={{
              position: 'absolute',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'var(--surface)',
              border: '1px solid var(--gold)',
              top: '50%',
              left: '50%',
              transformOrigin: '0 0',
              transform: `rotate(${deg}deg) translate(34px, -5px)`,
            }} />
          ))}
        </div>
        {/* Inner ring (counter-spin) */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          border: '1px solid var(--gold-dim, #8a6420)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: 'var(--gold)',
            opacity: 0.6,
          }} className="animate-pulse-glow" />
        </div>
      </div>

      {/* Status message */}
      <div
        key={externalStatus || msgIndex}
        className="animate-fade-slide"
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontSize: '22px',
          color: 'var(--cream)',
          marginBottom: '12px',
          textAlign: 'center',
          minHeight: '32px',
        }}
      >
        {displayMessage}
      </div>

      {/* "Still working…" hint shown after 30 s when progress is stuck */}
      {slowWarning && externalProgress == null && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          color: 'var(--muted)',
          letterSpacing: '1px',
          marginBottom: '24px',
          textAlign: 'center',
        }}>
          Still working… large books can take a few minutes.
        </div>
      )}

      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: '400px', marginTop: slowWarning ? 0 : '28px' }}>
        <div style={{
          width: '100%',
          height: '2px',
          background: 'var(--border)',
          overflow: 'hidden',
        }}>
          <div
            className="progress-fill"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          letterSpacing: '2px',
          color: 'var(--muted)',
          textAlign: 'right',
          marginTop: '8px',
        }}>
          {externalProgress != null ? `${Math.round(displayProgress)}%` : `${Math.round(displayProgress)}%`}
        </div>
      </div>
    </div>
  )
}

LoadingScreen.propTypes = {
  progress: PropTypes.number,
  status:   PropTypes.string,
}
