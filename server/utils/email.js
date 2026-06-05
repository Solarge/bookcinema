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

export function verifyEmail(name, verifyUrl) {
  return `<p>Hi ${name},</p>
<p>Please verify your email address to unlock managed generation on BookFilm Studio.</p>
<p><a href="${verifyUrl}">Verify Email</a> (link expires in 24 hours)</p>
<p>If you didn't create an account, you can safely ignore this email.</p>`
}

export function passwordResetEmail(resetUrl) {
  return `<p>You requested a password reset for your BookFilm Studio account.</p>
<p><a href="${resetUrl}">Reset Password</a> (expires in 1 hour)</p>
<p>If you didn't request this, ignore this email.</p>`
}

export function welcomeEmail(name) {
  return `<p>Hi ${name},</p>
<p>Welcome to BookFilm Studio! Your email is verified and you're ready to turn books into cinematic AI video series.</p>
<p>Get started by pasting any book text or uploading a PDF — we'll generate a full 7-episode production package including characters, scenes, images, voice, and video.</p>
<p>Happy creating!</p>`
}

export function dunningEmail(workspaceName, billingUrl) {
  return `<p>Hi,</p>
<p>A payment for your <strong>${workspaceName}</strong> workspace on BookFilm Studio has failed.</p>
<p>To keep your current plan and avoid a downgrade, please update your payment method:</p>
<p><a href="${billingUrl}">Update Payment Method</a></p>
<p>If you believe this is a mistake, please contact us.</p>`
}

export function lowCreditEmail(name, balance, billingUrl) {
  return `<p>Hi ${name},</p>
<p>Your BookFilm Studio workspace is running low on credits — you have <strong>${balance} credits</strong> remaining.</p>
<p>Top up now to keep your productions going:</p>
<p><a href="${billingUrl}">Buy Credits</a></p>`
}

export function jobCompleteEmail(name, jobType, resultUrl) {
  return `<p>Hi ${name},</p>
<p>Your <strong>${jobType}</strong> generation on BookFilm Studio is ready!</p>
${resultUrl ? `<p><a href="${resultUrl}">View your result</a></p>` : '<p>Log in to BookFilm Studio to view your result.</p>'}
<p>Thanks for using BookFilm Studio.</p>`
}
