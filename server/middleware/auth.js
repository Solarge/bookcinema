import { verifyAccess } from '../utils/jwt.js'
import User from '../models/User.js'

// Attach user from JWT — returns 401 if missing/invalid
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' })
    const token = header.slice(7)
    const payload = verifyAccess(token)
    const user = await User.findById(payload.userId).select('-password -apiKeyHash -resetToken')
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found or inactive' })
    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Role-based access
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' })
    next()
  }
}

// Team membership check
export function requireTeamRole(...roles) {
  return async (req, res, next) => {
    if (!req.user.teamId) return res.status(403).json({ error: 'Not part of a team' })
    const Team = (await import('../models/Team.js')).default
    const team = await Team.findById(req.user.teamId)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const memberRole = team.getMemberRole(req.user._id)
    if (!memberRole || (roles.length && !roles.includes(memberRole))) {
      return res.status(403).json({ error: 'Insufficient team role' })
    }
    req.team = team
    next()
  }
}

// Optional auth — attaches user if token present, continues if not
export async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7)
      const payload = verifyAccess(token)
      req.user = await User.findById(payload.userId).select('-password -apiKeyHash -resetToken')
    }
  } catch (_) { /* ignore */ }
  next()
}
