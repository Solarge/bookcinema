import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import analyticsRoutes from '../routes/analytics.js'
import UsageLog from '../models/UsageLog.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/analytics', analyticsRoutes)
  return a
}
const authed = (req, token, wsId) => req.set('Authorization', `Bearer ${token}`).set('X-Workspace-Id', wsId.toString())

test('analytics summary is scoped to the active workspace', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  await UsageLog.create({ userId: user._id, workspaceId: workspace._id, action: 'generate_image', costUsd: 0.05, success: true })
  await UsageLog.create({ userId: user._id, workspaceId: new mongoose.Types.ObjectId(), action: 'generate_image', costUsd: 99, success: true }) // different workspace

  const res = await authed(request(app()).get('/api/analytics'), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.stats.totalImages, 1)
  assert.ok(res.body.stats.totalCost < 1, 'cost excludes the other workspace')
})

test('analytics requires auth + workspace (401 without token)', async () => {
  const res = await request(app()).get('/api/analytics')
  assert.equal(res.status, 401)
})
