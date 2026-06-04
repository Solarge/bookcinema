import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import User from '../models/User.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

test('user has defaultWorkspaceId field and no teamId', async () => {
  const u = await User.create({ name: 'A', email: 'a@x.com', password: 'password1234' })
  assert.equal(u.defaultWorkspaceId, null)
  assert.equal(u.schema.path('teamId'), undefined) // teamId removed
  const wsId = new mongoose.Types.ObjectId()
  u.defaultWorkspaceId = wsId
  await u.save()
  assert.equal(u.defaultWorkspaceId.toString(), wsId.toString())
})
