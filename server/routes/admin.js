import { Router } from 'express'
import User from '../models/User.js'
import Series from '../models/Series.js'
import UsageLog from '../models/UsageLog.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { grantCredits } from '../utils/credits.js'

const router = Router()
router.use(requireAuth, requireRole('admin'))

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query
    const query = search ? { $or: [{ email: { $regex: search, $options: 'i' } }, { name: { $regex: search, $options: 'i' } }] } : {}
    const [users, total] = await Promise.all([
      User.find(query).select('-password -apiKeyHash -resetToken').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)),
      User.countDocuments(query),
    ])
    res.json({ users, total })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/admin/users/:id/credits — add/set credits
router.patch('/users/:id/credits', async (req, res) => {
  try {
    const { credits, operation = 'set' } = req.body
    const update = operation === 'add'
      ? { $inc: { credits: Number(credits) } }
      : { $set: { credits: Number(credits) } }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ userId: user._id, credits: user.credits })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/admin/users/:id/plan
router.patch('/users/:id/plan', async (req, res) => {
  try {
    const { plan, role } = req.body
    const update = {}
    if (plan) update.plan = plan
    if (role) update.role = role
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user.toSafeObject())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/admin/users/:id/deactivate
router.patch('/users/:id/deactivate', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ message: `User ${user.email} deactivated` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/admin/workspaces/:id/credits — grant (positive) or deduct (negative) workspace credits
router.patch('/workspaces/:id/credits', async (req, res) => {
  try {
    const amount = Number(req.body.amount)
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'amount must be a non-zero number' })
    const r = await grantCredits(req.params.id, amount, { note: req.body.note || 'admin grant' })
    if (!r.ok) return res.status(404).json({ error: 'Workspace not found' })
    res.json({ workspaceId: req.params.id, balance: r.balance })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/admin/stats — platform overview
router.get('/stats', async (req, res) => {
  try {
    const [users, series, totalRevenue] = await Promise.all([
      User.countDocuments(),
      Series.countDocuments(),
      UsageLog.aggregate([{ $group: { _id: null, total: { $sum: '$costUsd' } } }]),
    ])
    res.json({ users, series, totalCostUsd: totalRevenue[0]?.total ?? 0 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
