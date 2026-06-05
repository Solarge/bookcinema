import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import '../styles/misc-components.css'

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
    <div className="ls-wrap">

      {/* Film reel */}
      <div className="ls-reel">
        {/* Outer ring */}
        <div className="ls-reel__outer animate-spin-reel">
          {/* Sprocket holes */}
          {[0, 60, 120, 180, 240, 300].map(deg => (
            <div
              key={deg}
              className="ls-reel__sprocket"
              style={{ transform: `rotate(${deg}deg) translate(34px, -5px)` }}
            />
          ))}
        </div>
        {/* Inner ring (counter-spin) */}
        <div className="ls-reel__inner">
          <div className="ls-reel__hub animate-pulse-glow" />
        </div>
      </div>

      {/* Status message */}
      <div
        key={externalStatus || msgIndex}
        className="ls-status-msg animate-fade-slide"
      >
        {displayMessage}
      </div>

      {/* "Still working…" hint shown after 30 s when progress is stuck */}
      {slowWarning && externalProgress == null && (
        <div className="ls-slow-warn">
          Still working… large books can take a few minutes.
        </div>
      )}

      {/* Progress bar */}
      <div className="ls-progress-wrap" style={{ marginTop: slowWarning ? 0 : '28px' }}>
        <div className="ls-progress-track">
          <div className="progress-fill" style={{ width: `${displayProgress}%` }} />
        </div>
        <div className="ls-progress-pct">
          {Math.round(displayProgress)}%
        </div>
      </div>
    </div>
  )
}

LoadingScreen.propTypes = {
  progress: PropTypes.number,
  status:   PropTypes.string,
}
