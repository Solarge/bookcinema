import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import User from '../models/User.js'
import Workspace from '../models/Workspace.js'
import { resolveWorkspace, requireWorkspaceRole } from '../middleware/workspace.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

async function seed(role = 'owner') {
  const user = await User.create({ name: 'A', email: `a${Math.random()}@x.com`, password: 'password123' })
  const ws = await Workspace.create({
    name: 'WS', type: 'personal', ownerId: user._id, members: [{ userId: user._id, role }],
  })
  user.defaultWorkspaceId = ws._id
  await user.save()
  return { user, ws }
}

test('resolveWorkspace attaches req.workspace using the default when no header', async () => {
  const { user, ws } = await seed()
  const req = { user, headers: {} }
  const res = mockRes()
  let nexted = false
  await resolveWorkspace(req, res, () => { nexted = true })
  assert.equal(nexted, true)
  assert.equal(req.workspace._id.toString(), ws._id.toString())
  assert.equal(req.membership.role, 'owner')
})

test('resolveWorkspace prefers the X-Workspace-Id header over the default when the user is a member', async () => {
  const { user } = await seed()
  const other = await Workspace.create({
    name: 'Org', type: 'organization', ownerId: new mongoose.Types.ObjectId(),
    members: [{ userId: user._id, role: 'admin' }],
  })
  const req = { user, headers: { 'x-workspace-id': other._id.toString() } }
  const res = mockRes()
  let nexted = false
  await resolveWorkspace(req, res, () => { nexted = true })
  assert.equal(nexted, true)
  assert.equal(req.workspace._id.toString(), other._id.toString())
  assert.equal(req.membership.role, 'admin')
})

test('resolveWorkspace 404s (no existence oracle) when user is not a member of requested workspace', async () => {
  const { user } = await seed()
  const otherWs = await Workspace.create({
    name: 'Other', type: 'organization', ownerId: new mongoose.Types.ObjectId(),
    members: [{ userId: new mongoose.Types.ObjectId(), role: 'owner' }],
  })
  const req = { user, headers: { 'x-workspace-id': otherWs._id.toString() } }
  const res = mockRes()
  let nexted = false
  await resolveWorkspace(req, res, () => { nexted = true })
  assert.equal(res.statusCode, 404)
  assert.equal(nexted, false)
})

test('resolveWorkspace 404s on a malformed workspace id', async () => {
  const { user } = await seed()
  const req = { user, headers: { 'x-workspace-id': 'not-an-objectid' } }
  const res = mockRes()
  await resolveWorkspace(req, res, () => {})
  assert.equal(res.statusCode, 404)
})

test('resolveWorkspace 401s when req.user is missing', async () => {
  const req = { headers: {} }
  const res = mockRes()
  await resolveWorkspace(req, res, () => {})
  assert.equal(res.statusCode, 401)
})

test('requireWorkspaceRole allows a matching role', async () => {
  const req = { membership: { role: 'admin' } }
  const res = mockRes()
  let allowed = false
  requireWorkspaceRole('admin', 'owner')(req, res, () => { allowed = true })
  assert.equal(allowed, true)
})

test('requireWorkspaceRole blocks a non-matching role', async () => {
  const req = { membership: { role: 'member' } }
  const res = mockRes()
  let allowed = false
  requireWorkspaceRole('admin', 'owner')(req, res, () => { allowed = true })
  assert.equal(allowed, false)
  assert.equal(res.statusCode, 403)
})
