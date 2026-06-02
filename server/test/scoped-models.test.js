import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Series from '../models/Series.js'
import Asset from '../models/Asset.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

test('Series requires workspaceId and has no teamId path', async () => {
  assert.equal(Series.schema.path('teamId'), undefined)
  assert.ok(Series.schema.path('workspaceId'))
  const s = await Series.create({
    userId: new mongoose.Types.ObjectId(),
    workspaceId: new mongoose.Types.ObjectId(),
    title: 'T', fullOutput: { ok: true },
  })
  assert.ok(s.workspaceId)
})

test('Asset has workspaceId and no teamId path', async () => {
  assert.equal(Asset.schema.path('teamId'), undefined)
  assert.ok(Asset.schema.path('workspaceId'))
})
