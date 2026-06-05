import { Router } from 'express'
import User from '../models/User.js'
import Series from '../models/Series.js'
import UsageLog from '../models/UsageLog.js'
import Workspace from '../models/Workspace.js'
import Job from '../models/Job.js'
import AdminAuditLog from '../models/AdminAuditLog.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { adminLimiter } from '../middleware/rateLimit.js'
import { grantCredits } from '../utils/credits.js'
import { config } from '../config.js'
import { PLANS } from '../plans.js'
import { MANAGED_PROVIDERS } from '../generation/registry.js'
import { listConfigured as listSocialConfigured } from '../social/index.js'

const router = Router()
router.use(requireAuth, requireRole('admin'), adminLimiter)

// ── Audit log helper ─────────────────────────────────────────────────────────
// Best-effort: writes must not break the mutation if the log write fails.
async function audit(req, { action, targetType, targetId, detail }) {
  try {
    await AdminAuditLog.create({
      actorId:    req.user._id,
      actorEmail: req.user.email,
      action,
      targetType: targetType || '',
      targetId:   targetId   ? String(targetId) : '',
      detail:     detail     ?? null,
    })
  } catch (err) {
    console.error('[admin-audit] Failed to write audit log (non-fatal):', err.message)
  }
}

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query
    // Escape regex metacharacters to prevent ReDoS (mirror the pattern used in series routes).
    const escapedSearch = search ? String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null
    const query = escapedSearch ? { $or: [{ email: { $regex: escapedSearch, $options: 'i' } }, { name: { $regex: escapedSearch, $options: 'i' } }] } : {}
    const [users, total] = await Promise.all([
      User.find(query).select('-password -apiKeyHash -resetToken').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)),
      User.countDocuments(query),
    ])
    res.json({ users, total })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/admin/users/:id/credits — grant credits to the user's personal workspace
// (User.credits is a legacy field; the live credit state lives on Workspace.)
router.patch('/users/:id/credits', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const workspace = await Workspace.findOne({ ownerId: user._id, type: 'personal' })
    if (!workspace) return res.status(404).json({ error: 'Personal workspace not found' })
    const { credits, operation = 'add' } = req.body
    const amount = Number(credits)
    if (!Number.isFinite(amount)) return res.status(400).json({ error: 'credits must be a number' })
    const r = await grantCredits(workspace._id, amount, { note: `admin ${operation}`, bucket: 'monthly' })
    await audit(req, {
      action:     'user.credits.grant',
      targetType: 'User',
      targetId:   user._id,
      detail:     { amount, operation, workspaceId: workspace._id },
    })
    res.json({ userId: user._id, workspaceId: workspace._id, balance: r.balance })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/admin/users/:id/plan — set the plan on the user's personal workspace
// (User.plan is a legacy field; plan enforcement is workspace-level.)
router.patch('/users/:id/plan', async (req, res) => {
  try {
    const { plan, role } = req.body
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    // ── Self-demotion guard ──────────────────────────────────────────────────
    // An admin cannot change their own role to something other than 'admin'.
    if (role && role !== 'admin' && String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot change your own admin role' })
    }

    let roleChanged = false
    const roleBefore = user.role

    if (role) {
      await User.findByIdAndUpdate(req.params.id, { role })
      roleChanged = role !== roleBefore
    }
    if (plan) {
      const workspace = await Workspace.findOneAndUpdate(
        { ownerId: user._id, type: 'personal' },
        { plan },
        { new: true },
      )
      if (!workspace) return res.status(404).json({ error: 'Personal workspace not found' })
    }

    // Audit role change (including promotions)
    if (roleChanged) {
      await audit(req, {
        action:     'user.role.change',
        targetType: 'User',
        targetId:   user._id,
        detail:     { before: roleBefore, after: role },
      })
    }

    // Audit plan change
    if (plan) {
      await audit(req, {
        action:     'user.plan.set',
        targetType: 'User',
        targetId:   user._id,
        detail:     { plan, role: role || undefined },
      })
    }

    const updatedUser = await User.findById(req.params.id)
    const workspace = await Workspace.findOne({ ownerId: user._id, type: 'personal' })
    res.json({ ...updatedUser.toSafeObject(), workspacePlan: workspace?.plan ?? null })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/admin/users/:id/deactivate
router.patch('/users/:id/deactivate', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    if (!user) return res.status(404).json({ error: 'User not found' })
    await audit(req, {
      action:     'user.deactivate',
      targetType: 'User',
      targetId:   user._id,
      detail:     { email: user.email },
    })
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
    await audit(req, {
      action:     'workspace.credits.grant',
      targetType: 'Workspace',
      targetId:   req.params.id,
      detail:     { amount, note: req.body.note || 'admin grant', balance: r.balance },
    })
    res.json({ workspaceId: req.params.id, balance: r.balance })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/admin/workspaces/:id/managed — enable or disable managed-generation beta
router.patch('/workspaces/:id/managed', async (req, res) => {
  try {
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' })
    const workspace = await Workspace.findByIdAndUpdate(req.params.id, { managedBeta: !!enabled }, { new: true })
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' })
    await audit(req, {
      action:     'workspace.managed.set',
      targetType: 'Workspace',
      targetId:   workspace._id,
      detail:     { enabled },
    })
    res.json({ workspaceId: workspace._id, managedBeta: workspace.managedBeta })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/admin/workspaces?search= — list all workspaces (newest first, cap 100)
router.get('/workspaces', async (req, res) => {
  try {
    const { search } = req.query
    const escapedSearch = search ? String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null
    const query = escapedSearch
      ? { $or: [{ name: { $regex: escapedSearch, $options: 'i' } }, { slug: { $regex: escapedSearch, $options: 'i' } }] }
      : {}
    const workspaces = await Workspace.find(query)
      .select('name slug type plan managedBeta monthlyCredits purchasedCredits ownerId stripeSubscriptionId members createdAt')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    const result = workspaces.map(w => ({
      _id:                  w._id,
      name:                 w.name,
      slug:                 w.slug,
      type:                 w.type,
      plan:                 w.plan,
      managedBeta:          w.managedBeta,
      monthlyCredits:       w.monthlyCredits,
      purchasedCredits:     w.purchasedCredits,
      creditBalance:        (w.monthlyCredits || 0) + (w.purchasedCredits || 0),
      memberCount:          Array.isArray(w.members) ? w.members.length : 0,
      ownerId:              w.ownerId,
      stripeSubscriptionId: w.stripeSubscriptionId,
      createdAt:            w.createdAt,
    }))
    res.json({ workspaces: result, total: result.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/admin/jobs?status=&type=&limit= — recent platform-wide generation jobs
router.get('/jobs', async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit) || 50
    const limit = Math.min(rawLimit, 200)
    const filter = {}
    if (req.query.status) filter.status = req.query.status
    if (req.query.type)   filter.type   = req.query.type
    const [jobs, statusCounts] = await Promise.all([
      Job.find(filter)
        .select('workspaceId createdBy type tier status costUsd credits errorMessage createdAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ])
    const summary = { queued: 0, active: 0, done: 0, failed: 0 }
    for (const s of statusCounts) {
      if (s._id in summary) summary[s._id] = s.count
    }
    res.json({ jobs, total: jobs.length, summary })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/admin/audit?limit= — recent audit log entries (newest first, cap 200)
router.get('/audit', async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit) || 50
    const limit = Math.min(rawLimit, 200)
    const entries = await AdminAuditLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
    res.json({ entries, total: entries.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/admin/config — read-only system status (NO secrets, booleans + non-secret values only)
router.get('/config', async (req, res) => {
  try {
    // Collect unique adapters across all managed provider chains and report isConfigured().
    const seen = new Map()
    for (const type of Object.values(MANAGED_PROVIDERS)) {
      for (const tier of Object.values(type)) {
        for (const entry of tier.providers) {
          if (!seen.has(entry.provider)) {
            seen.set(entry.provider, entry.adapter)
          }
        }
      }
    }
    const providers = Array.from(seen.entries()).map(([provider, adapter]) => ({
      provider,
      configured: typeof adapter.isConfigured === 'function' ? adapter.isConfigured() : false,
    }))

    // Social providers configured status (no secrets).
    const social = listSocialConfigured()

    // Managed guardrails — values, not secrets.
    const managed = {
      enabled:        config.managed.enabled,
      maxConcurrent:  config.managed.maxConcurrent,
      starterCredits: config.managed.starterCredits,
      caps:           { ...config.managed.caps },
    }

    // Stripe — booleans only, never expose keys/ids.
    const stripe = {
      configured: !!config.stripe.secretKey,
      pricesConfigured: Object.fromEntries(
        Object.entries(config.stripe.prices).map(([k, v]) => [k, !!v])
      ),
    }

    // Redis — boolean only.
    const redis = { configured: !!config.redis.url }

    res.json({ providers, social, managed, stripe, plans: PLANS, redis })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/admin/stats — platform overview (expanded with workspaces + jobs)
router.get('/stats', async (req, res) => {
  try {
    const [users, series, totalRevenue, workspaces, jobStatusCounts] = await Promise.all([
      User.countDocuments(),
      Series.countDocuments(),
      UsageLog.aggregate([{ $group: { _id: null, total: { $sum: '$costUsd' } } }]),
      Workspace.countDocuments(),
      Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ])
    const jobsByStatus = { queued: 0, active: 0, done: 0, failed: 0 }
    let totalJobs = 0
    for (const s of jobStatusCounts) {
      if (s._id in jobsByStatus) jobsByStatus[s._id] = s.count
      totalJobs += s.count
    }
    res.json({
      users,
      series,
      totalCostUsd: totalRevenue[0]?.total ?? 0,
      workspaces,
      jobs: { total: totalJobs, byStatus: jobsByStatus },
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
