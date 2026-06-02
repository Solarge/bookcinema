import { Router } from 'express'
import crypto from 'crypto'
import User from '../models/User.js'
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js'
import { sendEmail, passwordResetEmail } from '../utils/email.js'
import { config } from '../config.js'
import { authLimiter } from '../middleware/rateLimit.js'
import { blacklistToken } from '../utils/redis.js'
import { createPersonalWorkspace } from '../utils/workspace.js'

const router = Router()

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' })
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
    const exists = await User.findOne({ email: email.toLowerCase() })
    if (exists) return res.status(409).json({ error: 'Email already registered' })
    const user = await User.create({ name, email, password })
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
    if (!user || !await user.comparePassword(password)) return res.status(401).json({ error: 'Invalid email or password' })
    if (!user.isActive) return res.status(403).json({ error: 'Account deactivated' })
    user.lastLoginAt = new Date()
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
    const user = await User.findById(payload.userId)
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found' })
    const accessToken = signAccess({ userId: user._id, email: user.email, role: user.role })
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
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
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
