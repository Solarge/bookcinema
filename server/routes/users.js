import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/users/me
router.get('/me', (req, res) => res.json(req.user.toSafeObject()))

// PUT /api/users/me — update profile
router.put('/me', async (req, res) => {
  try {
    const { name, avatar, preferences } = req.body
    const update = {}
    if (name)        update.name        = name
    if (avatar)      update.avatar      = avatar
    if (preferences) update.preferences = { ...req.user.preferences, ...preferences }
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true })
    res.json(user.toSafeObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/users/me/password — change password
router.put('/me/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })
    const user = await User.findById(req.user._id).select('+password')
    if (!await user.comparePassword(currentPassword)) return res.status(401).json({ error: 'Current password incorrect' })
    user.password = newPassword
    await user.save()
    res.json({ message: 'Password updated' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/users/me/api-key — generate API key
router.post('/me/api-key', async (req, res) => {
  try {
    const rawKey = `bfs_${crypto.randomBytes(32).toString('hex')}`
    const prefix = rawKey.slice(0, 12)
    const hashed = await bcrypt.hash(rawKey, 10)
    await User.findByIdAndUpdate(req.user._id, { apiKeyHash: hashed, apiKeyPrefix: prefix })
    // Return raw key ONCE — never stored in plaintext
    res.json({ apiKey: rawKey, prefix, message: 'Save this key — it will not be shown again.' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/users/me/api-key — revoke API key
router.delete('/me/api-key', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { apiKeyHash: null, apiKeyPrefix: null })
    res.json({ message: 'API key revoked' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/users/me/api-key — get prefix (not the full key)
router.get('/me/api-key', async (req, res) => {
  const user = await User.findById(req.user._id).select('+apiKeyPrefix')
  res.json({ prefix: user.apiKeyPrefix || null, hasKey: !!user.apiKeyPrefix })
})

export default router
