import { useState } from 'react'
import PropTypes from 'prop-types'
import { PLANS, CREDIT_PACKS } from '../../utils/plans'
import { LegalLinks } from '../legal/LegalPages'

// ── Helpers ───────────────────────────────────────────────────────────────────

function GoldLine() {
  return (
    <div aria-hidden="true" style={{
      height: '1px',
      background: 'linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold) 50%, var(--gold-dim) 70%, transparent)',
      margin: '0 auto',
      width: '100%',
    }} />
  )
}

// Reusable responsive section container
function Section({ children, id, style = {} }) {
  return (
    <section
      id={id}
      style={{
        width: '100%',
        padding: 'clamp(60px, 8vw, 96px) clamp(16px, 5vw, 40px)',
        ...style,
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        {children}
      </div>
    </section>
  )
}

// ── Nav bar ────────────────────────────────────────────────────────────────────
function NavBar({ onGetStarted, onSignIn }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(8,11,16,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 clamp(16px, 5vw, 40px)',
      }}
    >
      <div style={{
        maxWidth: '1100px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '60px',
        gap: '16px',
      }}>
        {/* Brand */}
        <a
          href="#top"
          aria-label="BookFilm Studio — home"
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 'clamp(14px, 2.5vw, 18px)',
            color: 'var(--gold)',
            textDecoration: 'none',
            letterSpacing: '2px',
            fontWeight: '700',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          BookFilm Studio
        </a>

        {/* Desktop nav links */}
        <nav
          aria-label="Main navigation"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(16px, 3vw, 32px)',
            flexShrink: 0,
          }}
        >
          <a href="#how-it-works" style={navLinkStyle}>How it works</a>
          <a href="#features" style={navLinkStyle}>Features</a>
          <a href="#pricing" style={navLinkStyle}>Pricing</a>

          <button
            onClick={onSignIn}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '1px',
              padding: '7px 16px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'border-color 0.2s, color 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)'; e.currentTarget.style.color = 'var(--cream)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
          >
            Sign in
          </button>

          <button
            onClick={onGetStarted}
            aria-label="Get started for free"
            style={{
              background: 'var(--gold)',
              color: '#080b10',
              border: 'none',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              padding: '8px 20px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Get started
          </button>
        </nav>

        {/* Mobile hamburger — hidden on desktop via media query trick with inline style */}
        <button
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(v => !v)}
          style={{
            display: 'none', // overridden by the responsive block below
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: '18px',
            lineHeight: 1,
          }}
          className="nav-hamburger"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '16px clamp(16px, 5vw, 40px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle}>How it works</a>
          <a href="#features" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle}>Features</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle}>Pricing</a>
          <button onClick={() => { setMenuOpen(false); onSignIn() }} style={mobileNavLinkStyle}>Sign in</button>
          <button onClick={() => { setMenuOpen(false); onGetStarted() }} style={{
            background: 'var(--gold)',
            color: '#080b10',
            border: 'none',
            fontFamily: "'Cinzel', serif",
            fontSize: '12px',
            fontWeight: '700',
            letterSpacing: '2px',
            padding: '12px',
            cursor: 'pointer',
            textAlign: 'center',
          }}>
            Get started free
          </button>
        </div>
      )}
    </header>
  )
}

// ── Hero section ──────────────────────────────────────────────────────────────
function HeroSection({ onGetStarted, onSignIn }) {
  return (
    <section
      id="top"
      aria-label="Hero"
      style={{
        position: 'relative',
        minHeight: 'clamp(480px, 80vh, 800px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: 'clamp(60px, 10vw, 120px) clamp(16px, 5vw, 40px)',
      }}
    >
      {/* Cinematic radial glow */}
      <div aria-hidden="true" style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse 80% 60% at 50% 0%, rgba(200,146,42,0.12) 0%, transparent 70%),
          radial-gradient(ellipse 60% 50% at 20% 100%, rgba(200,146,42,0.06) 0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 80% 100%, rgba(100,60,160,0.06) 0%, transparent 60%)
        `,
        pointerEvents: 'none',
      }} />

      {/* Film strip decoration — left */}
      <FilmStripDecor side="left" />
      {/* Film strip decoration — right */}
      <FilmStripDecor side="right" />

      <div style={{
        maxWidth: '800px',
        width: '100%',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Eyebrow */}
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 'clamp(9px, 1.5vw, 11px)',
          color: 'var(--gold)',
          letterSpacing: '4px',
          textTransform: 'uppercase',
          marginBottom: 'clamp(12px, 2vw, 20px)',
        }}>
          AI Cinematic Production
        </p>

        {/* Headline */}
        <h1 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 'clamp(32px, 6vw, 72px)',
          fontWeight: '900',
          color: 'var(--cream)',
          lineHeight: '1.1',
          letterSpacing: '-0.5px',
          marginBottom: 'clamp(16px, 3vw, 28px)',
        }}>
          Turn any book into<br />
          <span style={{ color: 'var(--gold)' }}>a cinematic AI series.</span>
        </h1>

        {/* Sub-headline */}
        <p style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 'clamp(16px, 2.5vw, 22px)',
          color: 'var(--muted)',
          lineHeight: '1.6',
          maxWidth: '600px',
          margin: '0 auto',
          marginBottom: 'clamp(28px, 5vw, 44px)',
        }}>
          Paste your book or upload a PDF — BookFilm Studio generates a complete{' '}
          <strong style={{ color: 'var(--cream)', fontWeight: '600' }}>7-episode cinematic production</strong>:
          characters, scenes, dialogue, AI images, voice, and video. Ready to publish.
        </p>

        {/* CTAs */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          justifyContent: 'center',
        }}>
          <button
            onClick={onGetStarted}
            aria-label="Start free — no credit card required"
            style={{
              background: 'var(--gold)',
              color: '#080b10',
              border: 'none',
              fontFamily: "'Cinzel', serif",
              fontSize: 'clamp(12px, 2vw, 14px)',
              fontWeight: '700',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              padding: 'clamp(12px, 2vw, 16px) clamp(24px, 4vw, 36px)',
              cursor: 'pointer',
              boxShadow: '0 0 40px rgba(200,146,42,0.25)',
              transition: 'box-shadow 0.2s, transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 60px rgba(200,146,42,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 40px rgba(200,146,42,0.25)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            Start free →
          </button>

          <a
            href="#how-it-works"
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--cream)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 'clamp(11px, 1.8vw, 13px)',
              letterSpacing: '1px',
              padding: 'clamp(12px, 2vw, 16px) clamp(20px, 3vw, 28px)',
              cursor: 'pointer',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            See how it works
          </a>
        </div>

        {/* Social proof */}
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          color: 'var(--muted)',
          letterSpacing: '1px',
          marginTop: '24px',
        }}>
          Free plan · No credit card required · 25 credits included
        </p>
      </div>
    </section>
  )
}

// ── Film strip decoration (pure CSS, no images) ───────────────────────────────
function FilmStripDecor({ side }) {
  const isLeft = side === 'left'
  const holes = Array.from({ length: 10 })

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [isLeft ? 'left' : 'right']: 0,
        width: '28px',
        background: 'rgba(14,18,25,0.7)',
        borderRight: isLeft ? '1px solid var(--border)' : 'none',
        borderLeft: isLeft ? 'none' : '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '12px 0',
        overflow: 'hidden',
        opacity: 0.5,
      }}
    >
      {holes.map((_, i) => (
        <div key={i} style={{
          width: '10px',
          height: '10px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg)',
          flexShrink: 0,
        }} />
      ))}
    </div>
  )
}

// ── How it works ──────────────────────────────────────────────────────────────
const STEPS = [
  {
    num: '01',
    title: 'Paste your book',
    body: 'Drop in the full text of any book or upload a PDF. BookFilm Studio reads it entirely — no excerpts, no summaries.',
    icon: '📖',
  },
  {
    num: '02',
    title: 'AI builds your world',
    body: 'The platform automatically extracts characters, defines episode arcs, writes scene-by-scene dialogue, and creates generation prompts for every frame.',
    icon: '🎭',
  },
  {
    num: '03',
    title: 'Generate images, voice & video',
    body: 'One click — BookFilm generates all your images, narration audio, and cinematic video clips using managed AI. No API keys. No setup.',
    icon: '🎬',
  },
  {
    num: '04',
    title: 'Publish to every platform',
    body: 'Schedule your episodes to YouTube, TikTok, Instagram, and X directly from the studio. Your book. On screen. Everywhere.',
    icon: '🚀',
  },
]

function HowItWorksSection() {
  return (
    <Section id="how-it-works" style={{ background: 'var(--surface)' }}>
      <GoldLine />
      <div style={{ marginTop: 'clamp(40px, 6vw, 60px)' }}>
        <p style={eyebrowStyle}>The Process</p>
        <h2 style={sectionHeadingStyle}>From page to screen in minutes.</h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: 'clamp(20px, 4vw, 32px)',
          marginTop: 'clamp(32px, 5vw, 52px)',
        }}>
          {STEPS.map((step) => (
            <div
              key={step.num}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                padding: 'clamp(20px, 3vw, 28px)',
                position: 'relative',
              }}
            >
              {/* Step number */}
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 'clamp(28px, 5vw, 40px)',
                color: 'var(--border)',
                fontWeight: '900',
                lineHeight: 1,
                marginBottom: '12px',
                letterSpacing: '-1px',
              }}>
                {step.num}
              </div>

              <div style={{ fontSize: 'clamp(22px, 3.5vw, 28px)', marginBottom: '10px' }} aria-hidden="true">
                {step.icon}
              </div>

              <h3 style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 'clamp(13px, 2vw, 15px)',
                color: 'var(--gold)',
                fontWeight: '600',
                letterSpacing: '1px',
                marginBottom: '10px',
              }}>
                {step.title}
              </h3>

              <p style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 'clamp(14px, 2vw, 16px)',
                color: 'var(--muted)',
                lineHeight: '1.65',
              }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ── Features grid ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '✦',
    title: 'Managed AI — no keys',
    body: 'Every model (text, image, voice, video) runs on our infrastructure. No API accounts. No per-provider billing. Just credits.',
  },
  {
    icon: '📼',
    title: '7-episode structure',
    body: 'Every book is shaped into a proper 7-episode arc with characters, per-scene dialogue, and visual continuity across the series.',
  },
  {
    icon: '🖼',
    title: 'Images, voice & video',
    body: 'Cinematic scene images, AI-narrated voice tracks, and short video clips — generated to match your story\'s tone and genre.',
  },
  {
    icon: '📅',
    title: 'Social scheduling',
    body: 'Schedule episodes to YouTube, TikTok, Instagram, and X from one place. Built-in OAuth connections for each platform.',
  },
  {
    icon: '👥',
    title: 'Team workspaces',
    body: 'Invite collaborators, share series, and manage credits across your team. Every workspace has its own library and settings.',
  },
  {
    icon: '🏷',
    title: 'White-label branding',
    body: 'Studio plan replaces all BookFilm branding with your own. Your logo, your colors, your domain — powered by BookFilm.',
  },
]

function FeaturesSection() {
  return (
    <Section id="features">
      <p style={eyebrowStyle}>Features</p>
      <h2 style={sectionHeadingStyle}>Everything a production studio needs.</h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: 'clamp(16px, 3vw, 24px)',
        marginTop: 'clamp(32px, 5vw, 52px)',
      }}>
        {FEATURES.map((feat) => (
          <div
            key={feat.title}
            style={{
              border: '1px solid var(--border)',
              padding: 'clamp(18px, 3vw, 26px)',
              background: 'rgba(14,18,25,0.6)',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <div style={{
              fontSize: 'clamp(20px, 3vw, 24px)',
              marginBottom: '12px',
              color: 'var(--gold)',
              fontFamily: feat.icon === '✦' ? "'Cinzel', serif" : undefined,
            }} aria-hidden="true">
              {feat.icon}
            </div>

            <h3 style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 'clamp(12px, 1.8vw, 14px)',
              color: 'var(--cream)',
              fontWeight: '600',
              letterSpacing: '0.5px',
              marginBottom: '8px',
            }}>
              {feat.title}
            </h3>

            <p style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 'clamp(14px, 2vw, 16px)',
              color: 'var(--muted)',
              lineHeight: '1.65',
            }}>
              {feat.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Pricing section ───────────────────────────────────────────────────────────
function PricingSection({ onGetStarted }) {
  const planKeys = ['free', 'pro', 'studio']

  return (
    <Section id="pricing" style={{ background: 'var(--surface)' }}>
      <GoldLine />
      <div style={{ marginTop: 'clamp(40px, 6vw, 60px)' }}>
        <p style={eyebrowStyle}>Pricing</p>
        <h2 style={sectionHeadingStyle}>Simple plans, no surprises.</h2>
        <p style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 'clamp(15px, 2vw, 18px)',
          color: 'var(--muted)',
          textAlign: 'center',
          maxWidth: '520px',
          margin: '0 auto clamp(32px, 5vw, 52px)',
          lineHeight: '1.6',
        }}>
          Pay only for what you use. Buy extra credits any time — they never expire.
        </p>

        {/* Plan cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: 'clamp(16px, 3vw, 24px)',
          alignItems: 'stretch',
        }}>
          {planKeys.map(key => {
            const plan = PLANS[key]
            const isPro = key === 'pro'
            const isFree = key === 'free'

            return (
              <div
                key={key}
                style={{
                  border: isPro ? '1px solid var(--gold)' : '1px solid var(--border)',
                  background: isPro ? 'rgba(200,146,42,0.05)' : 'var(--surface2)',
                  padding: 'clamp(24px, 4vw, 32px)',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: isPro ? '0 0 40px rgba(200,146,42,0.10)' : 'none',
                }}
              >
                {/* Most popular badge */}
                {isPro && (
                  <div style={{
                    position: 'absolute',
                    top: '-13px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--gold)',
                    color: '#080b10',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '9px',
                    fontWeight: '700',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    padding: '3px 14px',
                    whiteSpace: 'nowrap',
                  }}>
                    Most popular
                  </div>
                )}

                {/* Plan name */}
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 'clamp(18px, 3vw, 22px)',
                  color: isPro ? 'var(--gold)' : 'var(--cream)',
                  fontWeight: '700',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}>
                  {plan.label}
                </div>

                {/* Price */}
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 'clamp(28px, 5vw, 38px)',
                  color: 'var(--cream)',
                  fontWeight: '900',
                  marginBottom: '4px',
                }}>
                  {plan.price}
                </div>

                {/* Credits */}
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '10px',
                  color: 'var(--muted)',
                  letterSpacing: '1px',
                  marginBottom: '20px',
                }}>
                  {plan.credits} credits / month
                </div>

                <div style={{ height: '1px', background: 'var(--border)', marginBottom: '20px' }} aria-hidden="true" />

                {/* Feature list */}
                <ul
                  aria-label={`${plan.label} plan features`}
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: '0 0 24px',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {plan.displayFeatures.map((feat, i) => (
                    <li key={i} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: 'clamp(14px, 2vw, 16px)',
                      color: 'var(--cream)',
                      lineHeight: '1.5',
                    }}>
                      <span aria-hidden="true" style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '1px', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }}>✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isFree ? (
                  <button
                    onClick={onGetStarted}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: 'var(--cream)',
                      fontFamily: "'Cinzel', serif",
                      fontSize: '11px',
                      fontWeight: '600',
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      padding: '12px',
                      cursor: 'pointer',
                      width: '100%',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-dim)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    Start free
                  </button>
                ) : (
                  <button
                    onClick={onGetStarted}
                    aria-label={`Get started with ${plan.label} plan`}
                    style={{
                      background: isPro ? 'var(--gold)' : 'transparent',
                      border: isPro ? 'none' : '1px solid var(--gold)',
                      color: isPro ? '#080b10' : 'var(--gold)',
                      fontFamily: "'Cinzel', serif",
                      fontSize: '11px',
                      fontWeight: '700',
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      padding: '13px',
                      cursor: 'pointer',
                      width: '100%',
                      boxShadow: isPro ? '0 0 20px rgba(200,146,42,0.2)' : 'none',
                      transition: 'box-shadow 0.2s, transform 0.15s',
                    }}
                    onMouseEnter={e => { if (isPro) { e.currentTarget.style.boxShadow = '0 0 36px rgba(200,146,42,0.4)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
                    onMouseLeave={e => { if (isPro) { e.currentTarget.style.boxShadow = '0 0 20px rgba(200,146,42,0.2)'; e.currentTarget.style.transform = 'translateY(0)' } }}
                  >
                    Get started
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Credit packs */}
        <div style={{ marginTop: 'clamp(40px, 6vw, 60px)' }}>
          <h3 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 'clamp(14px, 2.5vw, 17px)',
            color: 'var(--cream)',
            letterSpacing: '2px',
            textAlign: 'center',
            marginBottom: 'clamp(20px, 3vw, 28px)',
          }}>
            Need more credits?
          </h3>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'clamp(12px, 2vw, 16px)',
            justifyContent: 'center',
          }}>
            {Object.entries(CREDIT_PACKS).map(([key, pack]) => (
              <div
                key={key}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface2)',
                  padding: 'clamp(14px, 2.5vw, 20px) clamp(20px, 3.5vw, 28px)',
                  textAlign: 'center',
                  minWidth: '140px',
                }}
              >
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 'clamp(18px, 3vw, 22px)',
                  color: 'var(--gold)',
                  fontWeight: '700',
                  marginBottom: '4px',
                }}>
                  {pack.price}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '10px',
                  color: 'var(--muted)',
                  letterSpacing: '1px',
                }}>
                  {pack.label}
                </div>
              </div>
            ))}
          </div>

          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: 'var(--muted)',
            textAlign: 'center',
            letterSpacing: '1px',
            marginTop: '16px',
          }}>
            Credits never expire · Shared across your workspace
          </p>
        </div>
      </div>
    </Section>
  )
}

// ── Final CTA band ────────────────────────────────────────────────────────────
function CtaBand({ onGetStarted }) {
  return (
    <Section style={{
      background: 'linear-gradient(180deg, var(--bg) 0%, rgba(200,146,42,0.06) 50%, var(--bg) 100%)',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
      textAlign: 'center',
    }}>
      <p style={eyebrowStyle}>Ready to begin?</p>

      <h2 style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 'clamp(26px, 5vw, 52px)',
        fontWeight: '900',
        color: 'var(--cream)',
        lineHeight: '1.15',
        marginBottom: 'clamp(12px, 2vw, 20px)',
      }}>
        Your book deserves<br />
        <span style={{ color: 'var(--gold)' }}>the big screen.</span>
      </h2>

      <p style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 'clamp(15px, 2.5vw, 19px)',
        color: 'var(--muted)',
        maxWidth: '480px',
        margin: '0 auto clamp(28px, 4vw, 40px)',
        lineHeight: '1.6',
      }}>
        Free to start. No API keys. No credit card. Transform your book into a full cinematic series today.
      </p>

      <button
        onClick={onGetStarted}
        aria-label="Create your free account"
        style={{
          background: 'var(--gold)',
          color: '#080b10',
          border: 'none',
          fontFamily: "'Cinzel', serif",
          fontSize: 'clamp(12px, 2vw, 15px)',
          fontWeight: '700',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          padding: 'clamp(14px, 2.5vw, 18px) clamp(32px, 6vw, 56px)',
          cursor: 'pointer',
          boxShadow: '0 0 60px rgba(200,146,42,0.30)',
          transition: 'box-shadow 0.2s, transform 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 80px rgba(200,146,42,0.5)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 60px rgba(200,146,42,0.30)'; e.currentTarget.style.transform = 'translateY(0)' }}
      >
        Create free account →
      </button>
    </Section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function SiteFooter({ onSignIn }) {
  return (
    <footer
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: 'clamp(32px, 5vw, 48px) clamp(16px, 5vw, 40px)',
      }}
    >
      <div style={{
        maxWidth: '1100px',
        margin: '0 auto',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'clamp(24px, 4vw, 40px)',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}>
        {/* Brand */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 'clamp(14px, 2.5vw, 17px)',
            color: 'var(--gold)',
            fontWeight: '700',
            letterSpacing: '2px',
            marginBottom: '8px',
          }}>
            BookFilm Studio
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: 'var(--muted)',
            letterSpacing: '1px',
          }}>
            Books on screen, everywhere.
          </div>
        </div>

        {/* Nav + legal links */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'clamp(12px, 2vw, 16px)',
          alignItems: 'center',
        }}>
          <a href="#how-it-works" style={footerLinkStyle}>How it works</a>
          <a href="#features" style={footerLinkStyle}>Features</a>
          <a href="#pricing" style={footerLinkStyle}>Pricing</a>
          <button onClick={onSignIn} style={{ ...footerLinkStyle, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }}>
            Sign in
          </button>
        </div>
      </div>

      {/* Legal links row */}
      <div style={{
        maxWidth: '1100px',
        margin: 'clamp(24px, 4vw, 32px) auto 0',
        borderTop: '1px solid var(--border)',
        paddingTop: 'clamp(16px, 3vw, 24px)',
      }}>
        <LegalLinks />
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          color: '#3a3228',
          letterSpacing: '1px',
          textAlign: 'center',
          marginTop: '16px',
        }}>
          © {new Date().getFullYear()} BookFilm Studio. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

// ── Shared style tokens ───────────────────────────────────────────────────────
const eyebrowStyle = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 'clamp(9px, 1.5vw, 11px)',
  color: 'var(--gold)',
  letterSpacing: '4px',
  textTransform: 'uppercase',
  marginBottom: 'clamp(10px, 2vw, 16px)',
  textAlign: 'center',
}

const sectionHeadingStyle = {
  fontFamily: "'Cinzel', serif",
  fontSize: 'clamp(24px, 4.5vw, 44px)',
  fontWeight: '900',
  color: 'var(--cream)',
  lineHeight: '1.15',
  textAlign: 'center',
  marginBottom: 'clamp(10px, 2vw, 16px)',
}

const navLinkStyle = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  color: 'var(--muted)',
  textDecoration: 'none',
  letterSpacing: '1px',
  transition: 'color 0.2s',
  whiteSpace: 'nowrap',
}

const mobileNavLinkStyle = {
  background: 'none',
  border: 'none',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '13px',
  color: 'var(--cream)',
  textDecoration: 'none',
  letterSpacing: '1px',
  cursor: 'pointer',
  textAlign: 'left',
  padding: '4px 0',
}

const footerLinkStyle = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '10px',
  color: 'var(--muted)',
  textDecoration: 'none',
  letterSpacing: '1px',
  transition: 'color 0.2s',
}

// ── Responsive hamburger injection ────────────────────────────────────────────
// We inject a <style> tag once to show the hamburger at ≤640px and
// hide the desktop nav at ≤640px.  This avoids a runtime CSS-in-JS
// dependency and keeps the bundle tiny.
let _injected = false
function ensureResponsiveStyles() {
  if (_injected || typeof document === 'undefined') return
  _injected = true
  const style = document.createElement('style')
  style.textContent = `
    @media (max-width: 640px) {
      .nav-hamburger { display: flex !important; align-items: center; }
      .nav-desktop   { display: none !important; }
    }
  `
  document.head.appendChild(style)
}

// ── Root component ────────────────────────────────────────────────────────────
export default function LandingPage({ onGetStarted, onSignIn }) {
  ensureResponsiveStyles()

  return (
    <div className="film-grain" style={{ minHeight: '100vh', background: 'var(--bg)', overflowX: 'hidden' }}>
      <NavBar onGetStarted={onGetStarted} onSignIn={onSignIn} />

      <main>
        <HeroSection onGetStarted={onGetStarted} onSignIn={onSignIn} />
        <HowItWorksSection />
        <FeaturesSection />
        <PricingSection onGetStarted={onGetStarted} />
        <CtaBand onGetStarted={onGetStarted} />
      </main>

      <SiteFooter onSignIn={onSignIn} />
    </div>
  )
}

LandingPage.propTypes = {
  onGetStarted: PropTypes.func.isRequired,
  onSignIn:     PropTypes.func.isRequired,
}
