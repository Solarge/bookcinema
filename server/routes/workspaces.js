import { Router } from 'express'
import crypto from 'crypto'
import mongoose from 'mongoose'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import { sendEmail, teamInviteEmail } from '../utils/email.js'
import { config } from '../config.js'
import { planFeatures, planMaxSeats } from '../plans.js'
import { syncSeats } from '../utils/seats.js'

const router = Router()
router.use(requireAuth)

// GET /api/workspaces — all workspaces the user belongs to
router.get('/', async (req, res) => {
  try {
    const list = await Workspace.find({ 'members.userId': req.user._id }).sort({ createdAt: 1 })
    res.json(list)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces/switch — set the user's default (active) workspace
router.post('/switch', async (req, res) => {
  try {
    const { workspaceId } = req.body
    if (!mongoose.isValidObjectId(workspaceId)) return res.status(403).json({ error: 'Not a member of this workspace' })
    const ws = await Workspace.findById(workspaceId)
    if (!ws || !ws.hasMember(req.user._id)) return res.status(403).json({ error: 'Not a member of this workspace' })
    await User.findByIdAndUpdate(req.user._id, { defaultWorkspaceId: ws._id })
    res.json({ activeWorkspaceId: ws._id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/workspaces/:id/members
router.get('/:id/members', async (req, res) => {
  try {
    const ws = await Workspace.findById(req.params.id).populate('members.userId', 'name email avatar')
    if (!ws || !ws.hasMember(req.user._id)) return res.status(403).json({ error: 'Not a member of this workspace' })
    res.json(ws.members)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces — create an organization workspace
router.post('/', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'Workspace name required' })
    const ws = await Workspace.create({
      name, type: 'organization', ownerId: req.user._id,
      members: [{ userId: req.user._id, role: 'owner' }],
    })
    res.status(201).json(ws)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/workspaces/:id — update settings (owner only)
router.put('/:id', async (req, res) => {
  try {
    const ws = await Workspace.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!ws) return res.status(403).json({ error: 'Not workspace owner' })
    const { name, settings } = req.body
    if (name)     ws.name = name
    if (settings) {
      const next = { ...settings }
      if (next.whiteLabel && !planFeatures(ws.plan).whiteLabel) delete next.whiteLabel
      Object.assign(ws.settings, next)
    }
    await ws.save()
    res.json(ws)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces/:id/invite — invite a member (owner/admin)
router.post('/:id/invite', async (req, res) => {
  try {
    const { email, role = 'member' } = req.body
    const ws = mongoose.isValidObjectId(req.params.id) ? await Workspace.findById(req.params.id) : null
    if (!ws || !['owner', 'admin'].includes(ws.getMemberRole(req.user._id))) return res.status(403).json({ error: 'Not authorized' })
    if (ws.type === 'organization' && planMaxSeats(ws.plan) != null && ws.members.length >= planMaxSeats(ws.plan)) {
      return res.status(402).json({ error: 'Upgrade to a paid plan to add team members', code: 'seat_limit' })
    }
    const token = crypto.randomBytes(20).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 86400000)
    ws.invites = ws.invites.filter(i => i.email !== email.toLowerCase())
    ws.invites.push({ email: email.toLowerCase(), role, token, expiresAt, invitedBy: req.user._id })
    await ws.save()
    const url = `${config.clientUrl}/invite?token=${token}`
    await sendEmail({ to: email, subject: `You're invited to ${ws.name} — BookFilm Studio`, html: teamInviteEmail(req.user.name, ws.name, url) })
    res.json({ message: `Invitation sent to ${email}` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces/accept-invite
router.post('/accept-invite', async (req, res) => {
  try {
    const { token } = req.body
    const ws = await Workspace.findOne({ 'invites.token': token, 'invites.expiresAt': { $gt: new Date() } })
    if (!ws) return res.status(400).json({ error: 'Invalid or expired invitation' })
    const invite = ws.invites.find(i => i.token === token)
    if (invite.email !== req.user.email.toLowerCase()) return res.status(403).json({ error: 'Invitation is for a different email' })
    if (!ws.hasMember(req.user._id)) {
      if (ws.type === 'organization' && planMaxSeats(ws.plan) != null && ws.members.length >= planMaxSeats(ws.plan)) {
        return res.status(402).json({ error: 'Upgrade to a paid plan to add team members', code: 'seat_limit' })
      }
      ws.members.push({ userId: req.user._id, role: invite.role })
    }
    ws.invites = ws.invites.filter(i => i.token !== token)
    await ws.save()
    await syncSeats(ws, { stripe: req.app.locals.stripe })
    res.json({ workspace: ws, message: 'Joined workspace successfully' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/workspaces/:id/members/:userId — change member role (owner)
router.patch('/:id/members/:userId', async (req, res) => {
  try {
    const { role } = req.body
    if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' })
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(403).json({ error: 'Not workspace owner' })
    const ws = await Workspace.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!ws) return res.status(403).json({ error: 'Not workspace owner' })
    if (req.params.userId === ws.ownerId.toString()) return res.status(400).json({ error: 'Cannot change the workspace owner role' })
    const member = ws.members.find(m => m.userId.toString() === req.params.userId)
    if (!member) return res.status(404).json({ error: 'Member not found' })
    member.role = role
    await ws.save()
    res.json(ws)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces/:id/transfer-ownership — transfer ownership to an existing member (owner only)
router.post('/:id/transfer-ownership', async (req, res) => {
  try {
    const { newOwnerId } = req.body
    if (!newOwnerId || !mongoose.isValidObjectId(newOwnerId)) return res.status(400).json({ error: 'newOwnerId must be a valid user id' })
    const ws = mongoose.isValidObjectId(req.params.id) ? await Workspace.findById(req.params.id) : null
    if (!ws || ws.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the workspace owner can transfer ownership' })
    // New owner must already be a member
    const targetMember = ws.members.find(m => m.userId.toString() === newOwnerId)
    if (!targetMember) return res.status(400).json({ error: 'Target user is not a member of this workspace' })
    // Cannot transfer to yourself
    if (newOwnerId === req.user._id.toString()) return res.status(400).json({ error: 'Cannot transfer ownership to yourself' })
    // Swap roles: new owner → 'owner', old owner → 'admin'
    for (const m of ws.members) {
      if (m.userId.toString() === newOwnerId) m.role = 'owner'
      else if (m.userId.toString() === req.user._id.toString()) m.role = 'admin'
    }
    ws.ownerId = newOwnerId
    await ws.save()
    res.json(ws)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/workspaces/:id/members/:userId — remove member (owner/admin)
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const ws = mongoose.isValidObjectId(req.params.id) ? await Workspace.findById(req.params.id) : null
    if (!ws || !['owner', 'admin'].includes(ws.getMemberRole(req.user._id))) return res.status(403).json({ error: 'Insufficient role' })
    if (req.params.userId === ws.ownerId.toString()) return res.status(400).json({ error: 'Cannot remove the workspace owner' })
    ws.members = ws.members.filter(m => m.userId.toString() !== req.params.userId)
    await ws.save()
    await syncSeats(ws, { stripe: req.app.locals.stripe })
    res.json({ message: 'Member removed' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
