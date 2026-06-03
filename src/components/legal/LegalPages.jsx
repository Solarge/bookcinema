import { useState } from 'react'

// ── shared overlay / modal shell ─────────────────────────────────────────────
function LegalModal({ title, onClose, children }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: '100%', maxWidth: '580px', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: 'var(--gold)', letterSpacing: '3px' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Draft banner */}
        <div style={{ background: '#3a2800', borderBottom: '1px solid #806000', padding: '10px 20px', flexShrink: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#f0c040', letterSpacing: '1px' }}>
            ⚠ DRAFT — placeholder text, not legal advice; replace before launch.
          </span>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--cream)', lineHeight: '1.8' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── shared section heading helper ────────────────────────────────────────────
function H({ children }) {
  return (
    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: 'var(--gold)', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '20px', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
      {children}
    </div>
  )
}

function P({ children }) {
  return <p style={{ margin: '0 0 10px', color: 'var(--muted)' }}>{children}</p>
}

// ── Terms of Service ─────────────────────────────────────────────────────────
export function TermsOfService({ onClose }) {
  return (
    <LegalModal title="TERMS OF SERVICE" onClose={onClose}>
      <H>1. Acceptance of Terms</H>
      <P>By creating an account and using BookFilm Studio (&quot;Service&quot;), you agree to these Terms of Service. If you do not agree, do not use the Service.</P>

      <H>2. Description of Service</H>
      <P>BookFilm Studio is a creative tool that converts book text into AI-generated cinematic production packages including episode scripts, scene descriptions, character profiles, images, video clips, and voice-overs.</P>

      <H>3. Third-Party AI Providers</H>
      <P>Managed generation features send your prompts and content excerpts to third-party AI APIs including Anthropic, OpenAI, Groq, DeepSeek, Google (Gemini), Replicate, fal.ai, and ElevenLabs. By using these features you acknowledge your content will be processed by those providers under their own terms of service and privacy policies.</P>

      <H>4. User Accounts &amp; Content</H>
      <P>You are responsible for maintaining the security of your account credentials. You retain ownership of your original content. By uploading content you grant BookFilm Studio a limited licence to process it solely to provide the Service.</P>

      <H>5. Billing &amp; Payments</H>
      <P>Paid plans and credit packs are billed via Stripe. Subscription fees are charged at the start of each billing period. Credits are non-refundable except where required by law. Plan details and pricing are shown at the time of purchase.</P>

      <H>6. User Rights: Export &amp; Deletion</H>
      <P>You may export a copy of your personal data at any time from Account → Profile → Data &amp; Privacy. You may permanently delete your account from the same section. Deletion removes your personal data and all associated content within 30 days.</P>

      <H>7. Acceptable Use</H>
      <P>You may not use the Service to generate content that is illegal, harmful, harassing, or that infringes third-party intellectual-property rights. We reserve the right to suspend accounts that violate this policy.</P>

      <H>8. Disclaimer of Warranties</H>
      <P>The Service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee that AI-generated content will be accurate, complete, or fit for any purpose.</P>

      <H>9. Limitation of Liability</H>
      <P>To the maximum extent permitted by law, BookFilm Studio shall not be liable for indirect, incidental, or consequential damages arising from your use of the Service.</P>

      <H>10. Changes to These Terms</H>
      <P>We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</P>

      <H>11. Contact</H>
      <P>Questions about these Terms? Email: legal@bookfilm.studio (placeholder — replace before launch).</P>
    </LegalModal>
  )
}

// ── Privacy Policy ───────────────────────────────────────────────────────────
export function PrivacyPolicy({ onClose }) {
  return (
    <LegalModal title="PRIVACY POLICY" onClose={onClose}>
      <H>1. Data We Collect</H>
      <P>Account data: your name, email address, hashed password, and the date you consented to these terms.</P>
      <P>Generated content: book text you submit, the AI-generated series data (episodes, scenes, characters), and any images, videos, or audio files generated or uploaded.</P>
      <P>Usage data: generation counts, provider selections, credit usage, and timestamps — used to provide analytics and improve the Service.</P>

      <H>2. How We Use Your Data</H>
      <P>To operate your account, process generation requests, provide analytics, and send transactional emails (password reset, billing receipts). We do not sell your personal data.</P>

      <H>3. Third-Party AI Processing</H>
      <P>When you use managed generation, your prompts and content excerpts are sent to third-party AI providers (Anthropic, OpenAI, Groq, DeepSeek, Google Gemini, Replicate, fal.ai, ElevenLabs). Each provider processes data under their own privacy policy. We recommend reviewing those policies before submitting sensitive content.</P>

      <H>4. Data Storage &amp; Security</H>
      <P>Your data is stored in MongoDB Atlas (cloud, encrypted at rest) and media assets in Amazon S3 (server-side encryption). We use industry-standard measures to protect your data, but no system is 100% secure.</P>

      <H>5. Cookies &amp; Sessions</H>
      <P>We use an httpOnly refresh-token cookie for session management. No third-party tracking cookies are set by default.</P>

      <H>6. Your Rights</H>
      <P>You have the right to access, correct, export, and delete your personal data. Use Account → Profile → Data &amp; Privacy to export a JSON bundle or permanently delete your account. For other requests contact us at the address below.</P>

      <H>7. Data Retention</H>
      <P>We retain your data while your account is active. After account deletion, personal data is purged within 30 days. Anonymised aggregated analytics may be retained indefinitely.</P>

      <H>8. Children</H>
      <P>The Service is not directed at children under 13. We do not knowingly collect data from children under 13.</P>

      <H>9. Changes to This Policy</H>
      <P>We will notify registered users of material changes by email. Continued use after the effective date constitutes acceptance.</P>

      <H>10. Contact</H>
      <P>Data-privacy enquiries: privacy@bookfilm.studio (placeholder — replace before launch).</P>
    </LegalModal>
  )
}

// ── LegalLinks — two small buttons that open the respective modal ─────────────
export function LegalLinks() {
  const [open, setOpen] = useState(null) // null | 'terms' | 'privacy'

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px' }}>
        <button
          onClick={() => setOpen('terms')}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >Terms of Service</button>
        <button
          onClick={() => setOpen('privacy')}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >Privacy Policy</button>
      </div>
      {open === 'terms'   && <TermsOfService onClose={() => setOpen(null)} />}
      {open === 'privacy' && <PrivacyPolicy  onClose={() => setOpen(null)} />}
    </>
  )
}
