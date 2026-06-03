import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import workspaceRoutes from '../routes/workspaces.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'
import { seatCount, syncSeats } from '../utils/seats.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function app(stripeOverride) {
  const a = express()
  a.use(express.json())
  if (stripeOverride) a.locals.stripe = stripeOverride
  a.use('/api/workspaces', workspaceRoutes)
  return a
}
const bearer = (req, token) => req.set('Authorization', `Bearer ${token}`)

// Case 1: seatCount returns 1 for personal, members.length for org (unit test)
test('seatCount returns 1 for a personal workspace', () => {
  const ws = { type: 'personal', members: [{ userId: 'u1' }, { userId: 'u2' }] }
  assert.equal(seatCount(ws), 1)
})

test('seatCount returns members.length for an org workspace', () => {
  const ws = { type: 'organization', members: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }] }
  assert.equal(seatCount(ws), 3)
})

// Case 2: inviting on a free org returns 402 (seat_limit)
test('invite on a free org returns 402 seat_limit', async () => {
  const { user, token } = await makeAuthedUser()
  // org with exactly maxSeats=1 (the owner already fills the seat)
  const org = await Workspace.create({
    name: 'FreeOrg', type: 'organization', ownerId: user._id, plan: 'free',
    members: [{ userId: user._id, role: 'owner' }],
  })
  const res = await bearer(request(app()).post(`/api/workspaces/${org._id}/invite`), token)
    .send({ email: 'invitee@example.com' })
  assert.equal(res.status, 402)
  assert.equal(res.body.code, 'seat_limit')
})

// Case 3: after upgrading org to pro, inviting succeeds
test('invite on a pro org succeeds (no seat cap)', async () => {
  const { user, token } = await makeAuthedUser()
  const org = await Workspace.create({
    name: 'ProOrg', type: 'organization', ownerId: user._id, plan: 'pro',
    members: [{ userId: user._id, role: 'owner' }],
  })
  const res = await bearer(request(app()).post(`/api/workspaces/${org._id}/invite`), token)
    .send({ email: 'invitee@example.com' })
  // email sending will fail in tests (no SMTP), but that's a 500 from sendEmail —
  // we only care it passed the seat cap check (not 402).
  assert.notEqual(res.status, 402, 'should not be rejected by seat cap')
})

// Case 4: syncSeats is a no-op when stripe is null / no subscription
test('syncSeats returns synced:false (no throw) when stripe is null', async () => {
  const ws = { type: 'organization', stripeSubscriptionId: null, members: [] }
  const result = await syncSeats(ws, { stripe: null })
  assert.equal(result.synced, false)
})

test('syncSeats returns synced:false (no throw) when workspace has no subscription', async () => {
  const fakeStripe = { subscriptions: { retrieve: async () => { throw new Error('should not be called') }, update: async () => {} } }
  const ws = { type: 'organization', stripeSubscriptionId: null, members: [{ userId: 'u1' }] }
  const result = await syncSeats(ws, { stripe: fakeStripe })
  assert.equal(result.synced, false)
  assert.equal(result.reason, 'no-subscription')
})

// Case 5: syncSeats calls subscriptions.update with quantity === member count
test('syncSeats calls subscriptions.update with correct quantity', async () => {
  let captured = null
  const fakeStripe = {
    subscriptions: {
      retrieve: async () => ({ items: { data: [{ id: 'si_1', quantity: 1 }] } }),
      update: async (id, params) => { captured = params; return {} },
    },
  }
  const ws = {
    type: 'organization',
    stripeSubscriptionId: 'sub_test123',
    members: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }],
  }
  const result = await syncSeats(ws, { stripe: fakeStripe })
  assert.equal(result.synced, true)
  assert.equal(result.quantity, 3)
  assert.ok(captured, 'subscriptions.update should have been called')
  assert.equal(captured.items[0].quantity, 3)
})
