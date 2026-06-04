import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import adminRoutes from '../routes/admin.js'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'
import { signAccess } from '../utils/jwt.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
function app() { const a = express(); a.use(express.json()); a.use('/api/admin', adminRoutes); return a }
async function adminToken() {
  const u = await User.create({ name: 'Admin', email: `a${Math.random()}@x.com`, password: 'password1234', role: 'admin' })
  return signAccess({ userId: u._id, email: u.email, role: u.role })
}

test('admin can enable managed access for a workspace', async () => {
  const token = await adminToken()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId() })
  assert.equal(w.managedBeta, false)
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/managed`).set('Authorization', `Bearer ${token}`).send({ enabled: true })
  assert.equal(res.status, 200)
  assert.equal(res.body.managedBeta, true)
  assert.equal(res.body.workspaceId.toString(), w._id.toString())
})

test('admin can disable managed access for a workspace', async () => {
  const token = await adminToken()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId(), managedBeta: true })
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/managed`).set('Authorization', `Bearer ${token}`).send({ enabled: false })
  assert.equal(res.status, 200)
  assert.equal(res.body.managedBeta, false)
})

test('non-admin is rejected with 403', async () => {
  const u = await User.create({ name: 'U', email: `u${Math.random()}@x.com`, password: 'password1234', role: 'user' })
  const token = signAccess({ userId: u._id, email: u.email, role: u.role })
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId() })
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/managed`).set('Authorization', `Bearer ${token}`).send({ enabled: true })
  assert.equal(res.status, 403)
})

test('missing enabled field returns 400', async () => {
  const token = await adminToken()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId() })
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/managed`).set('Authorization', `Bearer ${token}`).send({ enabled: 'yes' })
  assert.equal(res.status, 400)
})

test('non-boolean enabled value returns 400', async () => {
  const token = await adminToken()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId() })
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/managed`).set('Authorization', `Bearer ${token}`).send({ enabled: 1 })
  assert.equal(res.status, 400)
})

test('unknown workspace id returns 404', async () => {
  const token = await adminToken()
  const fakeId = new mongoose.Types.ObjectId()
  const res = await request(app()).patch(`/api/admin/workspaces/${fakeId}/managed`).set('Authorization', `Bearer ${token}`).send({ enabled: true })
  assert.equal(res.status, 404)
})
