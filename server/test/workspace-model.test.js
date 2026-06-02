import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Workspace from '../models/Workspace.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

const ownerId = () => new mongoose.Types.ObjectId()

test('creates a personal workspace with an owner member and slug', async () => {
  const uid = ownerId()
  const ws = await Workspace.create({
    name: 'Jane Doe', type: 'personal', ownerId: uid,
    members: [{ userId: uid, role: 'owner' }],
  })
  assert.equal(ws.type, 'personal')
  assert.equal(ws.plan, 'free')
  assert.equal(ws.managedBeta, false)
  assert.ok(ws.slug.length > 0)
  assert.equal(ws.getMemberRole(uid), 'owner')
  assert.equal(ws.hasMember(uid), true)
  assert.equal(ws.hasMember(ownerId()), false)
})

test('rejects an invalid member role', async () => {
  const uid = ownerId()
  await assert.rejects(() => Workspace.create({
    name: 'Bad', type: 'personal', ownerId: uid,
    members: [{ userId: uid, role: 'superuser' }],
  }))
})
