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

test('generates a url-safe slug and unique slugs for identical names', async () => {
  const a = await Workspace.create({ name: 'Acme Corp', type: 'organization', ownerId: new mongoose.Types.ObjectId(), members: [] })
  const b = await Workspace.create({ name: 'Acme Corp', type: 'organization', ownerId: new mongoose.Types.ObjectId(), members: [] })
  assert.match(a.slug, /^[a-z0-9-]+$/)
  assert.notEqual(a.slug, b.slug)
})
