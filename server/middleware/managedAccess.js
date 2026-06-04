import Job from '../models/Job.js'
import { config } from '../config.js'
import { applyMonthlyRefill } from '../utils/refill.js'
import { planAllows, minPlanFor } from '../plans.js'

function startOfUtcDay() { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d }

/**
 * Build a consistent 403 plan_feature response body.
 * Lets the client show an upgrade CTA keyed on feature + requiredPlan.
 */
export function planFeatureError(res, feature) {
  return res.status(403).json({
    error: `Your plan does not include ${feature} generation. Upgrade to ${minPlanFor(feature)} or higher.`,
    code: 'plan_feature',
    feature,
    requiredPlan: minPlanFor(feature),
  })
}

export function managedAccess(type, overrides = {}) {
  return async (req, res, next) => {
    try {
      const enabled = overrides.enabledOverride ?? config.managed.enabled
      if (!enabled) return res.status(503).json({ error: 'Managed generation is temporarily disabled' })

      if (!req.workspace?.managedBeta) return res.status(403).json({ error: 'Managed generation is not enabled for this workspace' })

      // Block unverified users from managed generation (admins bypass)
      if (!req.user?.emailVerifiedAt && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Please verify your email to use managed generation', code: 'email_unverified' })
      }

      // Plan-feature gate: enforce the feature matrix before spending any credits.
      // 'type' maps 1:1 to feature keys (text|image|voice|video).
      const plan = req.workspace.plan || 'free'
      if (!planAllows(plan, type)) {
        return planFeatureError(res, type)
      }

      req.workspace = await applyMonthlyRefill(req.workspace)

      const wsId = req.workspace._id
      const maxConcurrent = overrides.maxConcurrentOverride ?? config.managed.maxConcurrent
      const inflight = await Job.countDocuments({ workspaceId: wsId, status: { $in: ['queued', 'active'] } })
      if (inflight >= maxConcurrent) return res.status(429).json({ error: 'Too many in-flight generations; try again shortly' })

      const cap = overrides.capOverride ?? config.managed.caps[type]
      const todayCount = await Job.countDocuments({ workspaceId: wsId, type, createdAt: { $gte: startOfUtcDay() } })
      if (todayCount >= cap) return res.status(429).json({ error: `Daily ${type} generation limit reached` })

      next()
    } catch (err) {
      console.error('managedAccess error:', err)
      return res.status(500).json({ error: 'Server error' })
    }
  }
}
