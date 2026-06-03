import Job from '../models/Job.js'
import { config } from '../config.js'

function startOfUtcDay() { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d }

export function managedAccess(type, overrides = {}) {
  return async (req, res, next) => {
    try {
      const enabled = overrides.enabledOverride ?? config.managed.enabled
      if (!enabled) return res.status(503).json({ error: 'Managed generation is temporarily disabled' })

      if (!req.workspace?.managedBeta) return res.status(403).json({ error: 'Managed generation is not enabled for this workspace' })

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
