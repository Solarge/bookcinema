import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'
import { maybeRefundOnFailure } from '../worker/refundOnFailure.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
async function ws() { const u = new mongoose.Types.ObjectId(); return Workspace.create({ name: 'W', type: 'personal', ownerId: u, members: [{ userId: u, role: 'owner' }], monthlyCredits: 0, purchasedCredits: 0 }) }

test('refunds on terminal failure (attemptsMade >= attempts)', async () => {
  const w = await ws()
  const job = { data: { workspaceId: String(w._id), type: 'text', tier: 'premium', jobId: new mongoose.Types.ObjectId() }, attemptsMade: 2, opts: { attempts: 2 } }
  const r = await maybeRefundOnFailure(job)
  assert.equal(r.refunded, true)
  assert.equal((await Workspace.findById(w._id)).creditBalance, 3) // text premium
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'refund' }), 1)
})
test('does NOT refund while retries remain (attemptsMade < attempts)', async () => {
  const w = await ws()
  const job = { data: { workspaceId: String(w._id), type: 'text', tier: 'premium', jobId: new mongoose.Types.ObjectId() }, attemptsMade: 1, opts: { attempts: 2 } }
  const r = await maybeRefundOnFailure(job)
  assert.equal(r.refunded, false)
  assert.equal((await Workspace.findById(w._id)).creditBalance, 0)
})
