import { useState } from 'react'
import PropTypes from 'prop-types'
import { PLANS, CREDIT_PACKS } from '../../utils/plans'
import { LegalLinks } from '../legal/LegalPages'
import '../../styles/landing.css'

// ── Helpers ───────────────────────────────────────────────────────────────────
function GoldLine() {
  return <div aria-hidden="true" className="lp-goldline" />
}

function Section({ children, id, className = '' }) {
  return (
    <section id={id} className={`lp-section ${className}`}>
      <div className="lp-section-inner">{children}</div>
    </section>
  )
}
Section.propTypes = { children: PropTypes.node, id: PropTypes.string, className: PropTypes.string }

// ── Nav bar ────────────────────────────────────────────────────────────────────
function NavBar({ onGetStarted, onSignIn }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="lp-nav">
      <div className="lp-nav-inner">
        <a href="#top" aria-label="BookFilm Studio — home" className="lp-brand">BookFilm Studio</a>

        <nav aria-label="Main navigation" className="lp-nav-links">
          <a href="#how-it-works" className="lp-nav-link">How it works</a>
          <a href="#features" className="lp-nav-link">Features</a>
          <a href="#pricing" className="lp-nav-link">Pricing</a>
          <button onClick={onSignIn} className="lp-signin-btn">Sign in</button>
          <button onClick={onGetStarted} aria-label="Get started for free" className="lp-getstarted-btn">Get started</button>
        </nav>

        <button
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(v => !v)}
          className="lp-hamburger"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {menuOpen && (
        <div className="lp-mobile-menu">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="lp-mobile-link">How it works</a>
          <a href="#features" onClick={() => setMenuOpen(false)} className="lp-mobile-link">Features</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)} className="lp-mobile-link">Pricing</a>
          <button onClick={() => { setMenuOpen(false); onSignIn() }} className="lp-mobile-link">Sign in</button>
          <button onClick={() => { setMenuOpen(false); onGetStarted() }} className="lp-mobile-cta">Get started free</button>
        </div>
      )}
    </header>
  )
}
NavBar.propTypes = { onGetStarted: PropTypes.func.isRequired, onSignIn: PropTypes.func.isRequired }

// ── Hero section ──────────────────────────────────────────────────────────────
function HeroSection({ onGetStarted }) {
  return (
    <section id="top" aria-label="Hero" className="lp-hero">
      <div aria-hidden="true" className="lp-hero-glow" />
      <FilmStripDecor side="left" />
      <FilmStripDecor side="right" />

      <div className="lp-hero-inner">
        <p className="lp-hero-eyebrow">AI Cinematic Production</p>

        <h1 className="lp-h1">
          Turn any book into<br />
          <span className="lp-h1-accent">a cinematic AI series.</span>
        </h1>

        <p className="lp-sub">
          Paste your book or upload a PDF — BookFilm Studio generates a complete{' '}
          <strong>multi-episode cinematic production</strong> (3–12 episodes):
          characters, scenes, dialogue, AI images, voice, and video. Ready to publish.
        </p>

        <div className="lp-cta-row">
          <button onClick={onGetStarted} aria-label="Start free — no credit card required" className="lp-btn-primary">
            Start free →
          </button>
          <a href="#how-it-works" className="lp-btn-secondary">See how it works</a>
        </div>

        <p className="lp-social-proof">Free plan · No credit card required · 25 credits included</p>
      </div>
    </section>
  )
}
HeroSection.propTypes = { onGetStarted: PropTypes.func.isRequired }

// ── Film strip decoration (pure CSS, no images) ───────────────────────────────
function FilmStripDecor({ side }) {
  const holes = Array.from({ length: 10 })
  return (
    <div aria-hidden="true" className={`lp-filmstrip lp-filmstrip-${side}`}>
      {holes.map((_, i) => <div key={i} className="lp-filmstrip-hole" />)}
    </div>
  )
}
FilmStripDecor.propTypes = { side: PropTypes.oneOf(['left', 'right']).isRequired }

// ── How it works ──────────────────────────────────────────────────────────────
const STEPS = [
  { num: '01', title: 'Paste your book', body: 'Drop in the full text of any book or upload a PDF. BookFilm Studio reads it entirely — no excerpts, no summaries.', icon: '📖' },
  { num: '02', title: 'AI builds your world', body: 'The platform automatically extracts characters, defines episode arcs, writes scene-by-scene dialogue, and creates generation prompts for every frame.', icon: '🎭' },
  { num: '03', title: 'Generate images, voice & video', body: 'One click — BookFilm generates all your images, narration audio, and cinematic video clips using managed AI. No API keys. No setup.', icon: '🎬' },
  { num: '04', title: 'Publish to every platform', body: 'Schedule your episodes to YouTube, TikTok, Instagram, and X directly from the studio. Your book. On screen. Everywhere.', icon: '🚀' },
]

function HowItWorksSection() {
  return (
    <Section id="how-it-works" className="lp-section-surface">
      <GoldLine />
      <div className="lp-after-line">
        <p className="lp-eyebrow">The Process</p>
        <h2 className="lp-heading">From page to screen in minutes.</h2>

        <div className="lp-steps-grid">
          {STEPS.map((step) => (
            <div key={step.num} className="lp-step-card">
              <div className="lp-step-num">{step.num}</div>
              <div className="lp-step-icon" aria-hidden="true">{step.icon}</div>
              <h3 className="lp-step-title">{step.title}</h3>
              <p className="lp-step-body">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ── Features grid ─────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '✦', title: 'Managed AI — no keys', body: 'Every model (text, image, voice, video) runs on our infrastructure. No API accounts. No per-provider billing. Just credits.' },
  { icon: '📼', title: 'Flexible episode structure', body: 'Shape any book into a 3–12 episode arc with characters, per-scene dialogue, and visual continuity across the whole series.' },
  { icon: '🖼', title: 'Images, voice & video', body: 'Cinematic scene images, AI-narrated voice tracks, and short video clips — generated to match your story\'s tone and genre.' },
  { icon: '📅', title: 'Social scheduling', body: 'Schedule episodes to YouTube, TikTok, Instagram, and X from one place. Built-in OAuth connections for each platform.' },
  { icon: '👥', title: 'Team workspaces', body: 'Invite collaborators, share series, and manage credits across your team. Every workspace has its own library and settings.' },
  { icon: '🏷', title: 'White-label branding', body: 'Studio plan replaces all BookFilm branding with your own. Your logo, your colors, your domain — powered by BookFilm.' },
]

function FeaturesSection() {
  return (
    <Section id="features">
      <p className="lp-eyebrow">Features</p>
      <h2 className="lp-heading">Everything a production studio needs.</h2>

      <div className="lp-features-grid">
        {FEATURES.map((feat) => (
          <div key={feat.title} className="lp-feature-card">
            <div className={`lp-feature-icon${feat.icon === '✦' ? ' lp-feature-icon-display' : ''}`} aria-hidden="true">{feat.icon}</div>
            <h3 className="lp-feature-title">{feat.title}</h3>
            <p className="lp-feature-body">{feat.body}</p>
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
    <Section id="pricing" className="lp-section-surface">
      <GoldLine />
      <div className="lp-after-line">
        <p className="lp-eyebrow">Pricing</p>
        <h2 className="lp-heading">Simple plans, no surprises.</h2>
        <p className="lp-pricing-sub">Pay only for what you use. Buy extra credits any time — they never expire.</p>

        <div className="lp-plans-grid">
          {planKeys.map(key => {
            const plan = PLANS[key]
            const isPro = key === 'pro'
            const isFree = key === 'free'

            return (
              <div key={key} className={`lp-plan-card${isPro ? ' lp-plan-card-pro' : ''}`}>
                {isPro && <div className="lp-plan-badge">Most popular</div>}

                <div className={`lp-plan-name${isPro ? ' lp-plan-name-pro' : ''}`}>{plan.label}</div>
                <div className="lp-plan-price">{plan.price}</div>
                <div className="lp-plan-credits">{plan.credits} credits / month</div>
                <div className="lp-plan-divider" aria-hidden="true" />

                <ul aria-label={`${plan.label} plan features`} className="lp-plan-features">
                  {plan.displayFeatures.map((feat, i) => (
                    <li key={i} className="lp-plan-feature">
                      <span aria-hidden="true" className="lp-plan-check">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>

                {isFree ? (
                  <button onClick={onGetStarted} className="lp-plan-cta lp-plan-cta-free">Start free</button>
                ) : (
                  <button
                    onClick={onGetStarted}
                    aria-label={`Get started with ${plan.label} plan`}
                    className={`lp-plan-cta${isPro ? ' lp-plan-cta-pro' : ''}`}
                  >
                    Get started
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="lp-packs">
          <h3 className="lp-packs-head">Need more credits?</h3>
          <div className="lp-packs-row">
            {Object.entries(CREDIT_PACKS).map(([key, pack]) => (
              <div key={key} className="lp-pack">
                <div className="lp-pack-price">{pack.price}</div>
                <div className="lp-pack-label">{pack.label}</div>
              </div>
            ))}
          </div>
          <p className="lp-packs-note">Credits never expire · Shared across your workspace</p>
        </div>
      </div>
    </Section>
  )
}
PricingSection.propTypes = { onGetStarted: PropTypes.func.isRequired }

// ── Final CTA band ────────────────────────────────────────────────────────────
function CtaBand({ onGetStarted }) {
  return (
    <Section className="lp-cta-band">
      <p className="lp-eyebrow">Ready to begin?</p>
      <h2 className="lp-cta-h2">
        Your book deserves<br />
        <span className="lp-h1-accent">the big screen.</span>
      </h2>
      <p className="lp-cta-sub">
        Free to start. No API keys. No credit card. Transform your book into a full cinematic series today.
      </p>
      <button onClick={onGetStarted} aria-label="Create your free account" className="lp-cta-btn">
        Create free account →
      </button>
    </Section>
  )
}
CtaBand.propTypes = { onGetStarted: PropTypes.func.isRequired }

// ── Footer ────────────────────────────────────────────────────────────────────
function SiteFooter({ onSignIn }) {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div>
          <div className="lp-footer-brand">BookFilm Studio</div>
          <div className="lp-footer-tag">Books on screen, everywhere.</div>
        </div>

        <div className="lp-footer-links">
          <a href="#how-it-works" className="lp-footer-link">How it works</a>
          <a href="#features" className="lp-footer-link">Features</a>
          <a href="#pricing" className="lp-footer-link">Pricing</a>
          <button onClick={onSignIn} className="lp-footer-link">Sign in</button>
        </div>
      </div>

      <div className="lp-footer-legal">
        <LegalLinks />
        <p className="lp-copyright">© {new Date().getFullYear()} BookFilm Studio. All rights reserved.</p>
      </div>
    </footer>
  )
}
SiteFooter.propTypes = { onSignIn: PropTypes.func.isRequired }

// ── Root component ────────────────────────────────────────────────────────────
export default function LandingPage({ onGetStarted, onSignIn }) {
  return (
    <div className="film-grain lp-root">
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
