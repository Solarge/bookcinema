import nodemailer from 'nodemailer'
import { config } from '../config.js'

function getTransport() {
  if (!config.smtp.host) return null
  return nodemailer.createTransport({
    host:   config.smtp.host,
    port:   config.smtp.port,
    secure: config.smtp.port === 465,
    auth:   { user: config.smtp.user, pass: config.smtp.pass },
  })
}

export async function sendEmail({ to, subject, html }) {
  const resendKey = process.env.RESEND_API_KEY || config.email.resendApiKey
  if (resendKey) {
    const from = `${config.email.fromName} <${config.email.from}>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Resend email failed (${res.status}): ${detail}`)
    }
    return
  }
  const transport = getTransport()
  if (!transport) {
    console.info(`[Email skipped — no provider configured] To: ${to}  Subject: ${subject}`)
    return
  }
  await transport.sendMail({ from: config.smtp.from, to, subject, html })
}

export function teamInviteEmail(inviterName, teamName, inviteUrl) {
  return `<p>${inviterName} invited you to join the <strong>${teamName}</strong> workspace on BookFilm Studio.</p>
<p><a href="${inviteUrl}">Accept Invitation</a></p>`
}

export function passwordResetEmail(resetUrl) {
  return `<p>You requested a password reset for your BookFilm Studio account.</p>
<p><a href="${resetUrl}">Reset Password</a> (expires in 1 hour)</p>
<p>If you didn't request this, ignore this email.</p>`
}
