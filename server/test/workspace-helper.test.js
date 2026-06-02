import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import User from '../models/User.js'
import Workspace from '../models/Workspace.js'
import { createPersonalWorkspace } from '../utils/workspace.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

test('creates a personal workspace and sets the user default', async () => {
  const user = await User.create({ name: 'Jane', email: 'j@x.com', password: 'password123' })
  const ws = await createPersonalWorkspace(user)

  assert.equal(ws.type, 'personal')
  assert.equal(ws.ownerId.toString(), user._id.toString())
  assert.equal(ws.getMemberRole(user._id), 'owner')

  const reloaded = await User.findById(user._id)
  assert.equal(reloaded.defaultWorkspaceId.toString(), ws._id.toString())
})

test('is idempotent — returns existing personal workspace if one exists', async () => {
  const user = await User.create({ name: 'Jane', email: 'j2@x.com', password: 'password123' })
  const first = await createPersonalWorkspace(user)
  const second = await createPersonalWorkspace(await User.findById(user._id))
  assert.equal(first._id.toString(), second._id.toString())
  assert.equal(await Workspace.countDocuments({ ownerId: user._id, type: 'personal' }), 1)
})
