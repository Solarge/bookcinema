import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Job from '../models/Job.js'
import { managedAccess } from '../middleware/managedAccess.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
function mockRes() { return { statusCode: 200, body: null, status(c){this.statusCode=c;return this}, json(b){this.body=b;return this} } }
// emailVerifiedAt is set so tests pass the email-verification gate by default
function reqFor(managedBeta, wsId) { return { workspace: { _id: wsId, managedBeta }, user: { _id: new mongoose.Types.ObjectId(), emailVerifiedAt: new Date(), role: 'user' }, body: { type: 'text' }, params: {} } }

test('403 when workspace not on managed allowlist', async () => {
  const req = reqFor(false, new mongoose.Types.ObjectId()); const res = mockRes(); let n = false
  await managedAccess('text')(req, res, () => { n = true })
  assert.equal(res.statusCode, 403); assert.equal(n, false)
})

test('passes for an allowlisted workspace under cap', async () => {
  const req = reqFor(true, new mongoose.Types.ObjectId()); const res = mockRes(); let n = false
  await managedAccess('text')(req, res, () => { n = true })
  assert.equal(n, true)
})

test('429 when the daily text cap is reached', async () => {
  const wsId = new mongoose.Types.ObjectId()
  await Job.create({ workspaceId: wsId, createdBy: new mongoose.Types.ObjectId(), type: 'text', tier: 'standard', status: 'done' })
  const req = reqFor(true, wsId); const res = mockRes()
  await managedAccess('text', { capOverride: 1 })(req, res, () => {})
  assert.equal(res.statusCode, 429)
})

test('429 when concurrency exceeded', async () => {
  const wsId = new mongoose.Types.ObjectId()
  await Job.create({ workspaceId: wsId, createdBy: new mongoose.Types.ObjectId(), type: 'text', tier: 'standard', status: 'active' })
  const req = reqFor(true, wsId); const res = mockRes()
  await managedAccess('text', { maxConcurrentOverride: 1 })(req, res, () => {})
  assert.equal(res.statusCode, 429)
})

test('503 when kill-switch is off', async () => {
  const req = reqFor(true, new mongoose.Types.ObjectId()); const res = mockRes()
  await managedAccess('text', { enabledOverride: false })(req, res, () => {})
  assert.equal(res.statusCode, 503)
})
