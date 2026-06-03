import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'
import { debitCredits, refundCredits, grantCredits } from '../utils/credits.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
async function ws(balance) {
  const uid = new mongoose.Types.ObjectId()
  return Workspace.create({ name: 'W', type: 'personal', ownerId: uid, members: [{ userId: uid, role: 'owner' }], creditBalance: balance })
}

test('debitCredits succeeds when balance is sufficient and writes a ledger row', async () => {
  const w = await ws(10)
  const r = await debitCredits(w._id, 3, { type: 'text', tier: 'premium' })
  assert.equal(r.ok, true); assert.equal(r.balance, 7)
  assert.equal((await Workspace.findById(w._id)).creditBalance, 7)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'debit' }), 1)
})
test('debitCredits fails (no mutation) when balance is insufficient', async () => {
  const w = await ws(2)
  const r = await debitCredits(w._id, 5, { type: 'image', tier: 'premium' })
  assert.equal(r.ok, false)
  assert.equal((await Workspace.findById(w._id)).creditBalance, 2)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id }), 0)
})
test('refundCredits adds credits back + ledger row', async () => {
  const w = await ws(5)
  const r = await refundCredits(w._id, 4, { jobId: new mongoose.Types.ObjectId() })
  assert.equal(r.balance, 9)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'refund' }), 1)
})
test('grantCredits adds credits + ledger row', async () => {
  const w = await ws(0)
  const r = await grantCredits(w._id, 50, { note: 'beta grant' })
  assert.equal(r.balance, 50)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'grant' }), 1)
})
