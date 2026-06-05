import { useState } from 'react'
import '../styles/onboarding.css'

// Plain-language, creator-friendly first-run walkthrough.
const STEPS = [
  {
    icon: '📖',
    title: 'Add your book',
    body: 'Paste your story or upload a PDF. We read it and turn it into a cinematic series — no setup, no jargon.',
  },
  {
    icon: '✍️',
    title: 'Generate the script',
    body: 'Characters, episodes, and scenes are written for you in seconds. Read it over and tweak anything you like.',
  },
  {
    icon: '🎬',
    title: 'Make your movie',
    body: 'One click generates the videos, voices, and music, then combines them into a finished film — ready to share.',
  },
]

export default function Onboarding({ open, onClose }) {
  const [step, setStep] = useState(0)

  // When closed we render nothing; HomeScreen mounts this fresh each time it
  // opens the walkthrough, so `step` naturally starts at 0 on every open.
  if (!open) return null

  const isLast = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="onb-overlay" role="dialog" aria-modal="true" aria-label="How BookFilm Studio works">
      <div className="onb-card">
        <button className="onb-skip" onClick={onClose} aria-label="Close">Skip</button>

        <div className="onb-eyebrow">Welcome to BookFilm Studio</div>

        <div className="onb-icon" aria-hidden="true">{current.icon}</div>
        <div className="onb-step-count">Step {step + 1} of {STEPS.length}</div>
        <h2 className="onb-title">{current.title}</h2>
        <p className="onb-body">{current.body}</p>

        {/* Step dots */}
        <div className="onb-dots" role="tablist" aria-label="Walkthrough steps">
          {STEPS.map((s, i) => (
            <button
              key={i}
              className={`onb-dot${i === step ? ' is-active' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              aria-selected={i === step}
              role="tab"
            />
          ))}
        </div>

        {/* Controls */}
        <div className="onb-actions">
          <button
            className="onb-back"
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            ← Back
          </button>

          {isLast ? (
            <button className="onb-next onb-next--done" onClick={onClose}>
              Got it
            </button>
          ) : (
            <button className="onb-next" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
