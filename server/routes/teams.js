import { Router } from 'express'
import crypto from 'crypto'
import Team from '../models/Team.js'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import { sendEmail, teamInviteEmail } from '../utils/email.js'
import { config } from '../config.js'

const router = Router()
router.use(requireAuth)

// GET /api/teams/me — get current user's team
router.get('/me', async (req, res) => {
  try {
    if (!req.user.teamId) return res.json(null)
    const team = await Team.findById(req.user.teamId).populate('members.userId', 'name email avatar role')
    res.json(team)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/teams — create workspace
router.post('/', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'Team name required' })
    const team = await Team.create({
      name,
      ownerId: req.user._id,
      members: [{ userId: req.user._id, role: 'owner' }],
    })
    await User.findByIdAndUpdate(req.user._id, { teamId: team._id })
    res.status(201).json(team)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/teams/:id — update workspace settings
router.put('/:id', async (req, res) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!team) return res.status(403).json({ error: 'Not team owner' })
    const { name, settings } = req.body
    if (name)     team.name     = name
    if (settings) Object.assign(team.settings, settings)
    await team.save()
    res.json(team)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/teams/:id/invite — invite a member by email
router.post('/:id/invite', async (req, res) => {
  try {
    const { email, role = 'editor' } = req.body
    const team = await Team.findById(req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const memberRole = team.getMemberRole(req.user._id)
    if (!['owner', 'admin'].includes(memberRole)) return res.status(403).json({ error: 'Need admin role to invite' })
    const token = crypto.randomBytes(20).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 86400000) // 7 days
    team.invites = team.invites.filter(i => i.email !== email.toLowerCase())
    team.invites.push({ email: email.toLowerCase(), role, token, expiresAt, invitedBy: req.user._id })
    await team.save()
    const url = `${config.clientUrl}/invite?token=${token}`
    await sendEmail({ to: email, subject: `You're invited to ${team.name} — BookFilm Studio`, html: teamInviteEmail(req.user.name, team.name, url) })
    res.json({ message: `Invitation sent to ${email}` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/teams/accept-invite — accept an invitation
router.post('/accept-invite', async (req, res) => {
  try {
    const { token } = req.body
    const team = await Team.findOne({ 'invites.token': token, 'invites.expiresAt': { $gt: new Date() } })
    if (!team) return res.status(400).json({ error: 'Invalid or expired invitation' })
    const invite = team.invites.find(i => i.token === token)
    if (invite.email !== req.user.email.toLowerCase()) return res.status(403).json({ error: 'Invitation is for a different email' })
    if (!team.hasMember(req.user._id)) {
      team.members.push({ userId: req.user._id, role: invite.role })
    }
    team.invites = team.invites.filter(i => i.token !== token)
    await team.save()
    await User.findByIdAndUpdate(req.user._id, { teamId: team._id })
    res.json({ team, message: 'Joined team successfully' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/teams/:id/members/:userId — change member role
router.patch('/:id/members/:userId', async (req, res) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!team) return res.status(403).json({ error: 'Not team owner' })
    const { role } = req.body
    const member = team.members.find(m => m.userId.toString() === req.params.userId)
    if (!member) return res.status(404).json({ error: 'Member not found' })
    member.role = role
    await team.save()
    res.json(team)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/teams/:id/members/:userId — remove member
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const requesterRole = team.getMemberRole(req.user._id)
    if (!['owner', 'admin'].includes(requesterRole)) return res.status(403).json({ error: 'Insufficient role' })
    team.members = team.members.filter(m => m.userId.toString() !== req.params.userId)
    await team.save()
    await User.findByIdAndUpdate(req.params.userId, { teamId: null })
    res.json({ message: 'Member removed' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
