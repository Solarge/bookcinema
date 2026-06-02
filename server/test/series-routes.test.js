import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import seriesRoutes from '../routes/series.js'
import Series from '../models/Series.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/series', seriesRoutes)
  return a
}

function authed(req, token, workspaceId) {
  return req.set('Authorization', `Bearer ${token}`).set('X-Workspace-Id', workspaceId.toString())
}

test('series list returns only the active workspace rows', async () => {
  const { user, workspace, token } = await makeAuthedUser()
  await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'Mine', fullOutput: {} })
  await Series.create({ userId: user._id, workspaceId: new mongoose.Types.ObjectId(), title: 'Other', fullOutput: {} })

  const res = await authed(request(app()).get('/api/series'), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.items.length, 1)
  assert.equal(res.body.items[0].title, 'Mine')
})

test('series create stamps the active workspaceId', async () => {
  const { workspace, token } = await makeAuthedUser()
  const res = await authed(request(app()).post('/api/series'), token, workspace._id)
    .send({ title: 'New', fullOutput: { ok: 1 } })
  assert.equal(res.status, 201)
  assert.equal(res.body.workspaceId, workspace._id.toString())
})

test('series get 404s for a series in another workspace', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const foreign = await Series.create({ userId: user._id, workspaceId: new mongoose.Types.ObjectId(), title: 'Foreign', fullOutput: {} })
  const res = await authed(request(app()).get(`/api/series/${foreign._id}`), token, workspace._id)
  assert.equal(res.status, 404)
})
