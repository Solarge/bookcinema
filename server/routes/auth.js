import { Router } from 'express'
import crypto from 'crypto'
import User from '../models/User.js'
import { signAccess, signRefresh, verifyRefresh, verifyAccess } from '../utils/jwt.js'
import { sendEmail, passwordResetEmail, verifyEmail } from '../utils/email.js'
import { config } from '../config.js'
import { authLimiter } from '../middleware/rateLimit.js'
import { blacklistToken, isTokenBlacklisted } from '../utils/redis.js'
import { createPersonalWorkspace } from '../utils/workspace.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// The configured ADMIN_EMAIL is treated as an admin automatically (case-insensitive).
const isAdminEmail = (email) => !!config.admin.email && !!email && email.toLowerCase() === config.admin.email.toLowerCase()

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, consent, ageConfirmed, marketingConsent } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' })
    if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' })
    if (!consent) return res.status(400).json({ error: 'You must accept the Terms and Privacy Policy' })
    if (!ageConfirmed) return res.status(400).json({ error: 'You must confirm you are 16 or older' })
    const exists = await User.findOne({ email: email.toLowerCase() })
    if (exists) return res.status(409).json({ error: 'Email already registered' })
    const now = new Date()
    const user = await User.create({
      name, email, password,
      consentedAt: now,
      ageConfirmedAt: now,
      marketingConsentAt: marketingConsent ? now : null,
      role: isAdminEmail(email) ? 'admin' : 'user',
    })
    try {
      await createPersonalWorkspace(user)
    } catch (wsErr) {
      await User.findByIdAndDelete(user._id) // roll back so the email isn't locked by a half-finished signup
      throw wsErr
    }
    const fresh = await User.findById(user._id) // reload to include defaultWorkspaceId
    const accessToken  = signAccess({ userId: fresh._id, email: fresh.email, role: fresh.role })
    const refreshToken = signRefresh({ userId: fresh._id })
    res.cookie('refreshToken', refreshToken, cookieOpts())

    // Send email verification — best-effort (don't fail registration if email send fails)
    try {
      const verifyToken = signAccess({ userId: fresh._id.toString(), purpose: 'verify_email' })
      const verifyUrl = `${config.clientUrl}/?verify=${verifyToken}`
      await sendEmail({ to: fresh.email, subject: 'Verify your email — BookFilm Studio', html: verifyEmail(fresh.name, verifyUrl) })
    } catch (emailErr) {
      console.warn('[register] verification email failed (non-fatal):', emailErr.message)
    }

    res.status(201).json({ user: fresh.toSafeObject(), accessToken })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password')
    if (!user) return res.status(401).json({ error: 'Invalid email or password' })

    // Check account lockout before verifying password to avoid timing attacks
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked' })
    }

    if (!user.isActive) return res.status(403).json({ error: 'Account deactivated' })

    const passwordOk = await user.comparePassword(password)
    if (!passwordOk) {
      // Increment failed attempts; lock after 10 consecutive failures
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1
      if (user.failedLoginAttempts >= 10) {
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      }
      await user.save()
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Successful login — reset lockout counters
    if (isAdminEmail(user.email) && user.role !== 'admin') user.role = 'admin' // auto-promote the configured admin
    user.lastLoginAt = new Date()
    user.failedLoginAttempts = 0
    user.lockedUntil = null
    await user.save()
    const accessToken = signAccess({ userId: user._id, email: user.email, role: user.role })
    const refreshToken = signRefresh({ userId: user._id })
    res.cookie('refreshToken', refreshToken, cookieOpts())
    res.json({ user: user.toSafeObject(), accessToken })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken
    if (!token) return res.status(401).json({ error: 'No refresh token' })
    const payload = verifyRefresh(token)

    // Reject blacklisted tokens (logout / already-rotated tokens)
    if (payload.jti && await isTokenBlacklisted(payload.jti)) {
      return res.status(401).json({ error: 'Refresh token has been revoked' })
    }

    const user = await User.findById(payload.userId)
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found' })
    if (isAdminEmail(user.email) && user.role !== 'admin') { user.role = 'admin'; await user.save() } // auto-promote on refresh too

    // Rotate: blacklist the consumed token and issue a new one
    if (payload.jti) await blacklistToken(payload.jti, 7 * 24 * 3600)
    const accessToken  = signAccess({ userId: user._id, email: user.email, role: user.role })
    const newRefreshToken = signRefresh({ userId: user._id })
    res.cookie('refreshToken', newRefreshToken, cookieOpts())
    res.json({ accessToken })
  } catch (_) {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.cookies?.refreshToken
  if (token) {
    try {
      const payload = verifyRefresh(token)
      // Blacklist the refresh token in Redis so it can't be reused
      if (payload?.jti) await blacklistToken(payload.jti, 7 * 24 * 3600)
    } catch (_) { /* expired token — no need to blacklist */ }
  }
  res.clearCookie('refreshToken', cookieOpts())
  res.json({ message: 'Logged out' })
})

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body
    const user = await User.findOne({ email: email?.toLowerCase() })
    // Always respond 200 to prevent email enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link was sent.' })
    const token = crypto.randomBytes(32).toString('hex')
    user.resetToken   = token
    user.resetExpires = new Date(Date.now() + 3600000) // 1 hour
    await user.save()
    const url = `${config.clientUrl}/reset-password?token=${token}`
    await sendEmail({ to: user.email, subject: 'Password Reset — BookFilm Studio', html: passwordResetEmail(url) })
    res.json({ message: 'If that email exists, a reset link was sent.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' })
    if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' })
    const user = await User.findOne({ resetToken: token, resetExpires: { $gt: new Date() } }).select('+resetToken +resetExpires')
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' })
    user.password     = password
    user.resetToken   = null
    user.resetExpires = null
    await user.save()
    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/auth/verify-email?token=
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query
    if (!token) return res.status(400).json({ error: 'token is required' })
    let payload
    try {
      payload = verifyAccess(token)
    } catch (_) {
      return res.status(400).json({ error: 'Invalid or expired verification token' })
    }
    if (payload.purpose !== 'verify_email') return res.status(400).json({ error: 'Invalid token purpose' })
    const user = await User.findById(payload.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    user.emailVerifiedAt = user.emailVerifiedAt || new Date()
    await user.save()
    // In test/API mode return JSON; in browser redirect
    if (req.headers.accept?.includes('application/json')) {
      return res.json({ message: 'Email verified' })
    }
    return res.redirect(302, `${config.clientUrl}/?verified=1`)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/resend-verification
router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    if (req.user.emailVerifiedAt) return res.status(400).json({ error: 'Email already verified' })
    const verifyToken = signAccess({ userId: req.user._id.toString(), purpose: 'verify_email' })
    const verifyUrl = `${config.clientUrl}/?verify=${verifyToken}`
    await sendEmail({ to: req.user.email, subject: 'Verify your email — BookFilm Studio', html: verifyEmail(req.user.name, verifyUrl) })
    res.json({ message: 'Verification email sent' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function cookieOpts() {
  return {
    httpOnly: true,
    secure:   config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    path:     '/api/auth/refresh',
  }
}

export default router
