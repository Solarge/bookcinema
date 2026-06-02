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
  const transport = getTransport()
  if (!transport) {
    console.info(`[Email skipped — no SMTP] To: ${to}  Subject: ${subject}`)
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
