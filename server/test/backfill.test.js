import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import User from '../models/User.js'
import Workspace from '../models/Workspace.js'
import Series from '../models/Series.js'
import { runBackfill } from '../scripts/backfill-workspaces.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

test('gives every user a personal workspace and stamps their series', async () => {
  const user = await User.create({ name: 'Solo', email: 'solo@x.com', password: 'password123' })
  // legacy series created before workspaceId existed — insert raw to bypass required validation
  const legacy = await Series.collection.insertOne({ userId: user._id, title: 'Legacy', fullOutput: {}, createdAt: new Date(), updatedAt: new Date() })

  await runBackfill()

  const reloaded = await User.findById(user._id)
  assert.ok(reloaded.defaultWorkspaceId, 'user got a default workspace')
  const stamped = await Series.collection.findOne({ _id: legacy.insertedId })
  assert.equal(stamped.workspaceId.toString(), reloaded.defaultWorkspaceId.toString())
})

test('is idempotent — running twice does not create duplicate workspaces', async () => {
  await User.create({ name: 'Solo', email: 'solo2@x.com', password: 'password123' })
  await runBackfill()
  await runBackfill()
  assert.equal(await Workspace.countDocuments({ type: 'personal' }), 1)
})

test('unsets legacy explicit-null shareToken so the sparse unique index is satisfied', async () => {
  const u = await User.create({ name: 'S', email: 's3@x.com', password: 'password123' })
  await Series.collection.insertOne({ userId: u._id, title: 'L1', fullOutput: {}, shareToken: null, createdAt: new Date(), updatedAt: new Date() })
  await Series.collection.insertOne({ userId: u._id, title: 'L2', fullOutput: {}, shareToken: null, createdAt: new Date(), updatedAt: new Date() })
  await runBackfill()
  assert.equal(await Series.collection.countDocuments({ shareToken: null }), 0)
})
