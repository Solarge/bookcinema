import { Router } from 'express'
import crypto from 'crypto'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import { sendEmail, teamInviteEmail } from '../utils/email.js'
import { config } from '../config.js'

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
    if (settings) Object.assign(ws.settings, settings)
    await ws.save()
    res.json(ws)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces/:id/invite — invite a member (owner/admin)
router.post('/:id/invite', async (req, res) => {
  try {
    const { email, role = 'member' } = req.body
    const ws = await Workspace.findById(req.params.id)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    if (!['owner', 'admin'].includes(ws.getMemberRole(req.user._id))) return res.status(403).json({ error: 'Need admin role to invite' })
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
    if (!ws.hasMember(req.user._id)) ws.members.push({ userId: req.user._id, role: invite.role })
    ws.invites = ws.invites.filter(i => i.token !== token)
    await ws.save()
    res.json({ workspace: ws, message: 'Joined workspace successfully' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/workspaces/:id/members/:userId — change member role (owner)
router.patch('/:id/members/:userId', async (req, res) => {
  try {
    const ws = await Workspace.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!ws) return res.status(403).json({ error: 'Not workspace owner' })
    const member = ws.members.find(m => m.userId.toString() === req.params.userId)
    if (!member) return res.status(404).json({ error: 'Member not found' })
    member.role = req.body.role
    await ws.save()
    res.json(ws)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/workspaces/:id/members/:userId — remove member (owner/admin)
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const ws = await Workspace.findById(req.params.id)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    if (!['owner', 'admin'].includes(ws.getMemberRole(req.user._id))) return res.status(403).json({ error: 'Insufficient role' })
    ws.members = ws.members.filter(m => m.userId.toString() !== req.params.userId)
    await ws.save()
    res.json({ message: 'Member removed' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
