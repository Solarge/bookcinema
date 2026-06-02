import mongoose from 'mongoose'
import Workspace from '../models/Workspace.js'

// Resolve the active workspace for the request.
// Requires requireAuth to have run first (sets req.user).
export async function resolveWorkspace(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' })

    const headerId = req.headers['x-workspace-id']
    const targetId = headerId || req.user.defaultWorkspaceId
    if (!targetId) return res.status(400).json({ error: 'No active workspace' })
    if (!mongoose.isValidObjectId(targetId)) return res.status(404).json({ error: 'Workspace not found' })

    const workspace = await Workspace.findById(targetId)
    const role = workspace?.getMemberRole(req.user._id)
    // Treat "not a member" identically to "does not exist" so authenticated
    // users cannot probe which workspace IDs are real (no existence oracle).
    if (!workspace || !role) return res.status(404).json({ error: 'Workspace not found' })

    req.workspace = workspace
    req.membership = { role }
    next()
  } catch (err) {
    console.error('resolveWorkspace error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}

// Gate an action on the caller's role within the active workspace.
// Must be used after resolveWorkspace. Pass one or more allowed roles;
// calling with no roles denies everyone by design.
export function requireWorkspaceRole(...roles) {
  return (req, res, next) => {
    if (!req.membership) {
      console.error('requireWorkspaceRole used without resolveWorkspace')
      return res.status(500).json({ error: 'Server error' })
    }
    if (!roles.includes(req.membership.role)) {
      return res.status(403).json({ error: 'Insufficient workspace role' })
    }
    next()
  }
}
