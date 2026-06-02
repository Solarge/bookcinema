import Workspace from '../models/Workspace.js'

// Resolve the active workspace for the request.
// Requires requireAuth to have run first (sets req.user).
export async function resolveWorkspace(req, res, next) {
  try {
    const headerId = req.headers['x-workspace-id']
    const targetId = headerId || req.user.defaultWorkspaceId
    if (!targetId) return res.status(400).json({ error: 'No active workspace' })

    const workspace = await Workspace.findById(targetId)
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' })

    const role = workspace.getMemberRole(req.user._id)
    if (!role) return res.status(403).json({ error: 'Not a member of this workspace' })

    req.workspace = workspace
    req.membership = { role }
    next()
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Gate an action on the caller's role within the active workspace.
export function requireWorkspaceRole(...roles) {
  return (req, res, next) => {
    if (!req.membership) return res.status(500).json({ error: 'resolveWorkspace must run first' })
    if (!roles.includes(req.membership.role)) {
      return res.status(403).json({ error: 'Insufficient workspace role' })
    }
    next()
  }
}
