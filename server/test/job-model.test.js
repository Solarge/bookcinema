import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Job from '../models/Job.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

test('Job requires workspaceId + type + tier and defaults status to queued', async () => {
  const j = await Job.create({ workspaceId: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId(), type: 'text', tier: 'standard' })
  assert.equal(j.status, 'queued')
  assert.equal(j.type, 'text')
})

test('Job rejects an invalid status', async () => {
  await assert.rejects(() => Job.create({ workspaceId: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId(), type: 'text', tier: 'standard', status: 'banana' }))
})
