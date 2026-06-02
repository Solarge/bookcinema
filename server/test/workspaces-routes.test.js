import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import workspaceRoutes from '../routes/workspaces.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/workspaces', workspaceRoutes)
  return a
}
const bearer = (req, token) => req.set('Authorization', `Bearer ${token}`)

test('GET /api/workspaces lists only workspaces the user is a member of', async () => {
  const { token } = await makeAuthedUser() // user already has 1 personal workspace
  await Workspace.create({ name: 'NotMine', type: 'organization', ownerId: new mongoose.Types.ObjectId(), members: [{ userId: new mongoose.Types.ObjectId(), role: 'owner' }] })
  const res = await bearer(request(app()).get('/api/workspaces'), token)
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
  assert.equal(res.body[0].type, 'personal')
})

test('POST /api/workspaces creates an organization workspace with caller as owner', async () => {
  const { token } = await makeAuthedUser()
  const res = await bearer(request(app()).post('/api/workspaces'), token).send({ name: 'Acme' })
  assert.equal(res.status, 201)
  assert.equal(res.body.type, 'organization')
  assert.equal(res.body.members[0].role, 'owner')
})

test('POST /api/workspaces/switch sets the default workspace for a member', async () => {
  const { user, token } = await makeAuthedUser()
  const org = await Workspace.create({ name: 'Org', type: 'organization', ownerId: new mongoose.Types.ObjectId(), members: [{ userId: user._id, role: 'admin' }] })
  const res = await bearer(request(app()).post('/api/workspaces/switch'), token).send({ workspaceId: org._id.toString() })
  assert.equal(res.status, 200)
  assert.equal(res.body.activeWorkspaceId, org._id.toString())
})

test('POST /api/workspaces/switch 403s for a non-member workspace', async () => {
  const { token } = await makeAuthedUser()
  const foreign = await Workspace.create({ name: 'Foreign', type: 'organization', ownerId: new mongoose.Types.ObjectId(), members: [{ userId: new mongoose.Types.ObjectId(), role: 'owner' }] })
  const res = await bearer(request(app()).post('/api/workspaces/switch'), token).send({ workspaceId: foreign._id.toString() })
  assert.equal(res.status, 403)
})

test('invite returns 403 (not 404) for a non-member / nonexistent workspace', async () => {
  const { token } = await makeAuthedUser()
  const res = await bearer(request(app()).post(`/api/workspaces/${new mongoose.Types.ObjectId()}/invite`), token).send({ email: 'x@y.com' })
  assert.equal(res.status, 403)
})

test('remove-member returns 403 for a non-member / nonexistent workspace', async () => {
  const { token } = await makeAuthedUser()
  const res = await bearer(request(app()).delete(`/api/workspaces/${new mongoose.Types.ObjectId()}/members/${new mongoose.Types.ObjectId()}`), token)
  assert.equal(res.status, 403)
})

test('switch returns 403 (not 500) for a malformed workspace id', async () => {
  const { token } = await makeAuthedUser()
  const res = await bearer(request(app()).post('/api/workspaces/switch'), token).send({ workspaceId: 'not-an-id' })
  assert.equal(res.status, 403)
})
