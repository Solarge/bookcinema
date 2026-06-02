import Workspace from '../models/Workspace.js'
import User from '../models/User.js'

// Create (or return existing) personal workspace for a user, and set it as their default.
export async function createPersonalWorkspace(user) {
  const existing = await Workspace.findOne({ ownerId: user._id, type: 'personal' })
  if (existing) {
    if (!user.defaultWorkspaceId) {
      await User.findByIdAndUpdate(user._id, { defaultWorkspaceId: existing._id })
    }
    return existing
  }
  const ws = await Workspace.create({
    name: user.name || 'My Workspace',
    type: 'personal',
    ownerId: user._id,
    plan: 'free',
    members: [{ userId: user._id, role: 'owner' }],
  })
  await User.findByIdAndUpdate(user._id, { defaultWorkspaceId: ws._id })
  return ws
}
