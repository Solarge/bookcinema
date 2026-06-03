import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import { billingRouter, webhookHandler } from '../routes/billing.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'
import { config } from '../config.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

function fakeStripe() {
  return {
    customers: { create: async () => ({ id: 'cus_test' }) },
    checkout: { sessions: { create: async (args) => ({ url: 'https://checkout.stripe.test/' + args.mode }) } },
    billingPortal: { sessions: { create: async () => ({ url: 'https://portal.stripe.test' }) } },
  }
}
function checkoutApp(stripe) {
  const a = express(); a.use(express.json()); a.locals.stripe = stripe
  a.use('/api/billing', billingRouter); return a
}
function webhookApp(constructEvent) {
  const a = express(); a.locals.constructEvent = constructEvent
  a.post('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler); return a
}
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())

test('checkout subscription returns a session url + stores customer', async () => {
  config.stripe.prices.pro = 'price_pro'
  const { token, workspace } = await makeAuthedUser()
  const res = await authed(request(checkoutApp(fakeStripe())).post('/api/billing/checkout'), token, workspace._id).send({ kind: 'subscription', key: 'pro' })
  assert.equal(res.status, 200)
  assert.match(res.body.url, /subscription/)
  assert.equal((await Workspace.findById(workspace._id)).stripeCustomerId, 'cus_test')
})

test('checkout rejects an invalid plan (400)', async () => {
  const { token, workspace } = await makeAuthedUser()
  const res = await authed(request(checkoutApp(fakeStripe())).post('/api/billing/checkout'), token, workspace._id).send({ kind: 'subscription', key: 'enterprise' })
  assert.equal(res.status, 400)
})

test('webhook: pack checkout.session.completed grants purchased credits (idempotent)', async () => {
  config.stripe.prices.pack_medium = 'price_pack_med'
  const { workspace } = await makeAuthedUser()
  const before = (await Workspace.findById(workspace._id)).purchasedCredits
  const evt = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { mode: 'payment', customer: 'cus_x', metadata: { workspaceId: String(workspace._id), key: 'pack_medium' } } } }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r1 = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').send(JSON.stringify(evt))
  assert.equal(r1.status, 200)
  assert.equal((await Workspace.findById(workspace._id)).purchasedCredits, before + 500)
  // replay same event id → idempotent, no double grant
  const r2 = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').send(JSON.stringify(evt))
  assert.equal(r2.body.duplicate, true)
  assert.equal((await Workspace.findById(workspace._id)).purchasedCredits, before + 500)
})

test('webhook: subscription.updated sets the plan', async () => {
  config.stripe.prices.studio = 'price_studio'
  const { workspace } = await makeAuthedUser()
  const evt = { id: 'evt_2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', customer: 'cus_y', metadata: { workspaceId: String(workspace._id) }, items: { data: [{ price: { id: 'price_studio' } }] } } } }
  const app = webhookApp((body) => JSON.parse(body.toString()))
  const r = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').send(JSON.stringify(evt))
  assert.equal(r.status, 200)
  assert.equal((await Workspace.findById(workspace._id)).plan, 'studio')
})

test('webhook: bad signature (constructEvent throws) → 400', async () => {
  const app = webhookApp(() => { throw new Error('bad sig') })
  const r = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').send('{}')
  assert.equal(r.status, 400)
})
