import { useState, useEffect } from 'react'

const MESSAGES = [
  'Absorbing the story...',
  'Mapping the characters...',
  'Writing Episode 1...',
  'Crafting the dialogue...',
  'Generating Kling prompts...',
  'Building the character bible...',
  'Finalising your series...',
]

export default function LoadingScreen() {
  const [msgIndex, setMsgIndex] = useState(0)
  const [progress, setProgress] = useState(5)

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex(i => (i + 1) % MESSAGES.length)
    }, 3000)
    return () => clearInterval(msgTimer)
  }, [])

  useEffect(() => {
    const progTimer = setInterval(() => {
      setProgress(p => {
        if (p >= 90) return p
        return p + Math.random() * 8 + 2
      })
    }, 2000)
    return () => clearInterval(progTimer)
  }, [])

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
        key={msgIndex}
        className="animate-fade-slide"
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontSize: '22px',
          color: 'var(--cream)',
          marginBottom: '40px',
          textAlign: 'center',
          minHeight: '32px',
        }}
      >
        {MESSAGES[msgIndex]}
      </div>

      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{
          width: '100%',
          height: '2px',
          background: 'var(--border)',
          overflow: 'hidden',
        }}>
          <div
            className="progress-fill"
            style={{ width: `${Math.min(progress, 90)}%` }}
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
          {Math.round(Math.min(progress, 90))}%
        </div>
      </div>
    </div>
  )
}
