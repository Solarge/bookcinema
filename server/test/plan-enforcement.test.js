import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import generateRoutes from '../routes/generate.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
function app(q) { const a = express(); a.use(express.json()); if (q) a.locals.generationQueue = q; a.use('/api/generate', generateRoutes); return a }
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())
const Q = { add: async () => ({ id: 'b' }) }

test('free plan is blocked from premium tier (403)', async () => {
  const { token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true, plan: 'free' })
  const res = await authed(request(app(Q)).post('/api/generate/text'), token, workspace._id).send({ bookText: 'x', rightsConfirmed: true, tier: 'premium' })
  assert.equal(res.status, 403)
})
test('pro plan can use premium tier', async () => {
  const { token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true, plan: 'pro', monthlyCredits: 100, purchasedCredits: 0, creditPeriod: '9999-12' })
  const res = await authed(request(app(Q)).post('/api/generate/text'), token, workspace._id).send({ bookText: 'x', rightsConfirmed: true, tier: 'premium' })
  assert.equal(res.status, 202)
})
test('managed request triggers a monthly refill (free workspace gets 25 then debits 1)', async () => {
  const { token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true, plan: 'free', monthlyCredits: 0, purchasedCredits: 0, creditPeriod: '2000-01' })
  const res = await authed(request(app(Q)).post('/api/generate/text'), token, workspace._id).send({ bookText: 'x', rightsConfirmed: true, tier: 'standard' })
  assert.equal(res.status, 202)
  const ws = await Workspace.findById(workspace._id)
  assert.equal(ws.creditBalance, 24)
})
