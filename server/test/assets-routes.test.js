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
import Job from '../models/Job.js'
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

test('asset list presigns s3Url (browser-loadable, not the raw public URL)', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const seriesId = new mongoose.Types.ObjectId()
  await Asset.create({ ...assetBase(seriesId), s3Key: 'generated/x/y.png', s3Url: 'https://bucket.s3.us-east-1.amazonaws.com/generated/x/y.png', userId: user._id, workspaceId: workspace._id })
  const res = await authed(request(assetsApp()).get(`/api/assets/${seriesId}`), token, workspace._id)
  assert.equal(res.status, 200)
  assert.match(res.body[0].s3Url, /X-Amz-Signature=/)
})

test('from-job promotes a completed job into a presigned Asset', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const series = await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'T', fullOutput: { title: 'T' } })
  const job = await Job.create({
    workspaceId: workspace._id, createdBy: user._id, type: 'image', tier: 'standard', status: 'done',
    resultKey: `generated/${workspace._id}/job1.png`, resultUrl: `https://b.s3.us-east-1.amazonaws.com/generated/${workspace._id}/job1.png`,
  })
  const res = await authed(request(assetsApp()).post(`/api/assets/${series._id}/from-job`), token, workspace._id)
    .send({ jobId: String(job._id), assetKey: 'char-img:slug:c1:0', provider: 'managed' })
  assert.equal(res.status, 201)
  assert.equal(res.body.type, 'character_image')
  assert.equal(res.body.assetKey, 'char-img:slug:c1:0')
  assert.match(res.body.s3Url, /X-Amz-Signature=/)
  assert.equal(await Asset.countDocuments({ seriesId: series._id }), 1)
})

test('from-job honors a valid assetType override (music job → episode_score)', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const series = await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'T', fullOutput: { title: 'T' } })
  const job = await Job.create({
    workspaceId: workspace._id, createdBy: user._id, type: 'music', tier: 'standard', status: 'done',
    resultKey: `generated/${workspace._id}/score.mp3`, resultUrl: `https://b.s3.us-east-1.amazonaws.com/generated/${workspace._id}/score.mp3`,
  })
  const res = await authed(request(assetsApp()).post(`/api/assets/${series._id}/from-job`), token, workspace._id)
    .send({ jobId: String(job._id), assetKey: 'ep1:score', assetType: 'episode_score' })
  assert.equal(res.status, 201)
  assert.equal(res.body.type, 'episode_score')
})

test('from-job falls back to the job-type default when assetType is invalid (music → scene_music)', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const series = await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'T', fullOutput: { title: 'T' } })
  const job = await Job.create({
    workspaceId: workspace._id, createdBy: user._id, type: 'music', tier: 'standard', status: 'done',
    resultKey: `generated/${workspace._id}/bed.mp3`, resultUrl: `https://b.s3.us-east-1.amazonaws.com/generated/${workspace._id}/bed.mp3`,
  })
  const res = await authed(request(assetsApp()).post(`/api/assets/${series._id}/from-job`), token, workspace._id)
    .send({ jobId: String(job._id), assetKey: 'ep1-s2:bed', assetType: 'not_a_real_type' })
  assert.equal(res.status, 201)
  assert.equal(res.body.type, 'scene_music')
})

test('from-job maps a mux job to a scene_video asset (overwrites the silent clip slot)', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const series = await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'T', fullOutput: { title: 'T' } })
  const job = await Job.create({
    workspaceId: workspace._id, createdBy: user._id, type: 'mux', tier: 'standard', status: 'done',
    resultKey: `generated/${workspace._id}/job1-muxed.mp4`, resultUrl: `https://b.s3.us-east-1.amazonaws.com/generated/${workspace._id}/job1-muxed.mp4`,
  })
  const res = await authed(request(assetsApp()).post(`/api/assets/${series._id}/from-job`), token, workspace._id)
    .send({ jobId: String(job._id), assetKey: 'scene-video:slug:ep1:s2', provider: 'managed' })
  assert.equal(res.status, 201)
  assert.equal(res.body.type, 'scene_video')
  assert.equal(res.body.assetKey, 'scene-video:slug:ep1:s2')
})

test('from-job is idempotent per (series, assetKey) — regenerate updates in place', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const series = await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'T', fullOutput: { title: 'T' } })
  const mk = (n) => Job.create({ workspaceId: workspace._id, createdBy: user._id, type: 'image', tier: 'standard', status: 'done', resultKey: `generated/${workspace._id}/${n}.png`, resultUrl: `https://b.s3.us-east-1.amazonaws.com/generated/${workspace._id}/${n}.png` })
  const j1 = await mk('a'); const j2 = await mk('b')
  const send = (jid) => authed(request(assetsApp()).post(`/api/assets/${series._id}/from-job`), token, workspace._id).send({ jobId: String(jid), assetKey: 'char-img:slug:c1:0' })
  await send(j1._id)
  const res2 = await send(j2._id)
  assert.equal(res2.status, 201)
  assert.equal(await Asset.countDocuments({ seriesId: series._id }), 1)
  assert.equal((await Asset.findOne({ seriesId: series._id })).s3Key, `generated/${workspace._id}/b.png`)
})

test('from-job 409s when the job has no stored result', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const series = await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'T', fullOutput: { title: 'T' } })
  const job = await Job.create({ workspaceId: workspace._id, createdBy: user._id, type: 'image', tier: 'standard', status: 'queued' })
  const res = await authed(request(assetsApp()).post(`/api/assets/${series._id}/from-job`), token, workspace._id)
    .send({ jobId: String(job._id), assetKey: 'char-img:slug:c1:0' })
  assert.equal(res.status, 409)
})

test('from-job 404s for a job in another workspace', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const series = await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'T', fullOutput: { title: 'T' } })
  const foreignJob = await Job.create({ workspaceId: new mongoose.Types.ObjectId(), createdBy: user._id, type: 'image', tier: 'standard', status: 'done', resultKey: 'k', resultUrl: 'u' })
  const res = await authed(request(assetsApp()).post(`/api/assets/${series._id}/from-job`), token, workspace._id)
    .send({ jobId: String(foreignJob._id), assetKey: 'char-img:slug:c1:0' })
  assert.equal(res.status, 404)
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
