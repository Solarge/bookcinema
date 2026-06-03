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
  const u = await User.create({ name: 'Admin', email: `a${Math.random()}@x.com`, password: 'password123', role: 'admin' })
  return signAccess({ userId: u._id, email: u.email, role: u.role })
}

test('admin can grant credits to a workspace', async () => {
  const token = await adminToken()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId(), creditBalance: 5 })
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/credits`).set('Authorization', `Bearer ${token}`).send({ amount: 50 })
  assert.equal(res.status, 200)
  assert.equal(res.body.balance, 55)
})
test('non-admin is rejected', async () => {
  const u = await User.create({ name: 'U', email: `u${Math.random()}@x.com`, password: 'password123', role: 'user' })
  const token = signAccess({ userId: u._id, email: u.email, role: u.role })
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId() })
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/credits`).set('Authorization', `Bearer ${token}`).send({ amount: 50 })
  assert.equal(res.status, 403)
})
test('rejects a zero/invalid amount with 400', async () => {
  const token = await adminToken()
  const w = await Workspace.create({ name: 'W', type: 'personal', ownerId: new mongoose.Types.ObjectId() })
  const res = await request(app()).patch(`/api/admin/workspaces/${w._id}/credits`).set('Authorization', `Bearer ${token}`).send({ amount: 0 })
  assert.equal(res.status, 400)
})
