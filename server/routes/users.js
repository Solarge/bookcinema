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

// GET /api/users/me/export — GDPR data access (downloadable JSON)
router.get('/me/export', async (req, res) => {
  try {
    const Workspace = (await import('../models/Workspace.js')).default
    const Series = (await import('../models/Series.js')).default
    const UsageLog = (await import('../models/UsageLog.js')).default
    const rawWorkspaces = await Workspace.find({ 'members.userId': req.user._id }).lean()
    // Redact other members' PII and the org's billing identifiers — a GDPR export is the
    // caller's own data, not their colleagues' or the org's Stripe records.
    const uid = req.user._id.toString()
    const workspaces = rawWorkspaces.map((w) => ({
      _id: w._id,
      name: w.name,
      slug: w.slug,
      type: w.type,
      plan: w.plan,
      myRole: (w.members || []).find((m) => m.userId?.toString() === uid)?.role || null,
      memberCount: (w.members || []).length,
      createdAt: w.createdAt,
    }))
    // Only the caller's OWN series — not other members' content in shared org workspaces.
    const series = await Series.find({ userId: req.user._id }).select('-versions').lean()
    const usage = await UsageLog.find({ userId: req.user._id }).lean()
    res.setHeader('Content-Disposition', 'attachment; filename=bookfilm-my-data.json')
    res.json({ exportedAt: new Date().toISOString(), user: req.user.toSafeObject(), workspaces, series, usage })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/users/me — GDPR erasure
router.delete('/me', async (req, res) => {
  try {
    const Workspace = (await import('../models/Workspace.js')).default
    const Series = (await import('../models/Series.js')).default
    const Asset = (await import('../models/Asset.js')).default
    const Job = (await import('../models/Job.js')).default
    const UsageLog = (await import('../models/UsageLog.js')).default
    const CreditTransaction = (await import('../models/CreditTransaction.js')).default

    // Block if the user solely-owns an organization workspace that has other members.
    const ownedOrgs = await Workspace.find({ ownerId: req.user._id, type: 'organization' })
    const blocking = ownedOrgs.find(w => (w.members || []).some(m => m.userId.toString() !== req.user._id.toString()))
    if (blocking) return res.status(409).json({ error: 'Transfer or remove members from your organization workspaces before deleting your account' })

    // Erase the user's personal workspace(s) + their data.
    const personalWs = await Workspace.find({ ownerId: req.user._id, type: 'personal' })
    const wsIds = personalWs.map(w => w._id)
    if (wsIds.length) {
      await Series.deleteMany({ workspaceId: { $in: wsIds } })
      await Asset.deleteMany({ workspaceId: { $in: wsIds } })
      await Job.deleteMany({ workspaceId: { $in: wsIds } })
      await CreditTransaction.deleteMany({ workspaceId: { $in: wsIds } })
      await Workspace.deleteMany({ _id: { $in: wsIds } })
    }
    await UsageLog.deleteMany({ userId: req.user._id })
    // Remove the user from any org memberships they belong to.
    await Workspace.updateMany({ 'members.userId': req.user._id }, { $pull: { members: { userId: req.user._id } } })
    await User.findByIdAndDelete(req.user._id)
    res.json({ message: 'Account deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
