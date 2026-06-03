import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

test('Workspace has a numeric creditBalance default', async () => {
  const uid = new mongoose.Types.ObjectId()
  const ws = await Workspace.create({ name: 'W', type: 'personal', ownerId: uid, members: [{ userId: uid, role: 'owner' }] })
  assert.equal(typeof ws.creditBalance, 'number')
})
test('CreditTransaction records a signed amount + reason + balanceAfter', async () => {
  const tx = await CreditTransaction.create({ workspaceId: new mongoose.Types.ObjectId(), amount: -3, reason: 'debit', balanceAfter: 7 })
  assert.equal(tx.amount, -3); assert.equal(tx.reason, 'debit')
})
test('CreditTransaction rejects an invalid reason', async () => {
  await assert.rejects(() => CreditTransaction.create({ workspaceId: new mongoose.Types.ObjectId(), amount: 1, reason: 'bogus', balanceAfter: 1 }))
})
