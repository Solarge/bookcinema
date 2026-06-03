import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'
import { applyMonthlyRefill, currentPeriod } from '../utils/refill.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
async function ws(plan, balance, period) {
  const u = new mongoose.Types.ObjectId()
  return Workspace.create({ name: 'W', type: 'personal', ownerId: u, members: [{ userId: u, role: 'owner' }], plan, creditBalance: balance, creditPeriod: period })
}

test('refills to the plan allowance when the period rolls over', async () => {
  const w = await ws('pro', 3, '2000-01')
  const updated = await applyMonthlyRefill(w)
  assert.equal(updated.creditBalance, 500)
  assert.equal(updated.creditPeriod, currentPeriod())
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id, reason: 'grant' }), 1)
})
test('does NOT refill within the same period', async () => {
  const w = await ws('pro', 42, currentPeriod())
  const updated = await applyMonthlyRefill(w)
  assert.equal(updated.creditBalance, 42)
  assert.equal(await CreditTransaction.countDocuments({ workspaceId: w._id }), 0)
})
test('first-ever refill (no period) seeds the allowance', async () => {
  const w = await ws('free', 0, null)
  const updated = await applyMonthlyRefill(w)
  assert.equal(updated.creditBalance, 25)
})
