import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import assetRoutes from '../routes/assets.js'
import shareRoutes from '../routes/share.js'
import Asset from '../models/Asset.js'
import Series from '../models/Series.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function assetsApp() {
  const a = express()
  a.use(express.json())
  a.use('/api/assets', assetRoutes)
  return a
}
function shareApp() {
  const a = express()
  a.use(express.json())
  a.use('/api/share', shareRoutes)
  return a
}
function authed(req, token, workspaceId) {
  return req.set('Authorization', `Bearer ${token}`).set('X-Workspace-Id', workspaceId.toString())
}
const assetBase = (seriesId) => ({ seriesId, type: 'character_image', assetKey: 'k', s3Key: 'k', s3Url: 'u', s3Bucket: 'b' })

test('asset list returns only the active workspace assets for a series', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const seriesId = new mongoose.Types.ObjectId()
  await Asset.create({ ...assetBase(seriesId), userId: user._id, workspaceId: workspace._id })
  await Asset.create({ ...assetBase(seriesId), userId: user._id, workspaceId: new mongoose.Types.ObjectId() })

  const res = await authed(request(assetsApp()).get(`/api/assets/${seriesId}`), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
})

test('asset delete 404s for an asset in another workspace', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const foreign = await Asset.create({ ...assetBase(new mongoose.Types.ObjectId()), userId: user._id, workspaceId: new mongoose.Types.ObjectId() })
  const res = await authed(request(assetsApp()).delete(`/api/assets/${foreign._id}`), token, workspace._id)
  assert.equal(res.status, 404)
})

test('asset approval 404s for an asset in another workspace', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const foreign = await Asset.create({ ...assetBase(new mongoose.Types.ObjectId()), userId: user._id, workspaceId: new mongoose.Types.ObjectId() })
  const res = await authed(request(assetsApp()).patch(`/api/assets/${foreign._id}/approval`), token, workspace._id).send({ status: 'approved' })
  assert.equal(res.status, 404)
})

test('public share response excludes workspaceId and userId', async () => {
  const { user, workspace } = await makeAuthedUser()
  await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'Pub', fullOutput: { a: 1 }, shareToken: 'tok123', isPublic: true })
  const res = await request(shareApp()).get('/api/share/tok123')
  assert.equal(res.status, 200)
  assert.equal(res.body.series.workspaceId, undefined)
  assert.equal(res.body.series.userId, undefined)
})

test('public share excludes assets from other workspaces', async () => {
  const { user, workspace } = await makeAuthedUser()
  const series = await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'Pub', fullOutput: {}, shareToken: 'tok-xw', isPublic: true })
  // legit asset in the series' workspace
  await Asset.create({ ...assetBase(series._id), userId: user._id, workspaceId: workspace._id })
  // injected asset with same seriesId but a DIFFERENT workspace
  await Asset.create({ ...assetBase(series._id), userId: user._id, workspaceId: new mongoose.Types.ObjectId() })

  const res = await request(shareApp()).get('/api/share/tok-xw')
  assert.equal(res.status, 200)
  assert.equal(res.body.assets.length, 1)
})
