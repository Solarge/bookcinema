import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import jobsRoutes from '../routes/jobs.js'
import Job from '../models/Job.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
function app() { const a = express(); a.use(express.json()); a.use('/api/jobs', jobsRoutes); return a }
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())

test('GET /:id returns a job in the active workspace', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const job = await Job.create({ workspaceId: workspace._id, createdBy: user._id, type: 'text', tier: 'standard', status: 'done', resultText: '{"title":"X"}' })
  const res = await authed(request(app()).get(`/api/jobs/${job._id}`), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.status, 'done')
  assert.equal(res.body.result.text, '{"title":"X"}')
})

test("GET /:id returns a refine job's resultText as result.text (like 'text')", async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const envelope = '{"mode":"answer","answer":"It covers the book in one arc."}'
  const job = await Job.create({ workspaceId: workspace._id, createdBy: user._id, type: 'refine', tier: 'standard', status: 'done', resultText: envelope })
  const res = await authed(request(app()).get(`/api/jobs/${job._id}`), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.type, 'refine')
  assert.equal(res.body.result.text, envelope)
})

test('GET /:id presigns media result URL (not the raw public bucket URL)', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const key = `generated/${workspace._id}/abc123.png`
  const job = await Job.create({
    workspaceId: workspace._id, createdBy: user._id, type: 'image', tier: 'standard', status: 'done',
    resultUrl: `https://bucket.s3.us-east-1.amazonaws.com/${key}`, resultKey: key,
  })
  const res = await authed(request(app()).get(`/api/jobs/${job._id}`), token, workspace._id)
  assert.equal(res.status, 200)
  // Presigned URLs carry an AWS signature query string; the raw public URL does not.
  assert.match(res.body.result.url, /X-Amz-Signature=/)
  assert.ok(res.body.result.url.includes(key), 'presigned URL points at the stored key')
})

test('GET /:id falls back to keyFromUrl for legacy jobs without resultKey', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const key = `generated/${workspace._id}/legacy.png`
  const job = await Job.create({
    workspaceId: workspace._id, createdBy: user._id, type: 'image', tier: 'standard', status: 'done',
    resultUrl: `https://bucket.s3.us-east-1.amazonaws.com/${key}`, // no resultKey
  })
  const res = await authed(request(app()).get(`/api/jobs/${job._id}`), token, workspace._id)
  assert.equal(res.status, 200)
  assert.match(res.body.result.url, /X-Amz-Signature=/)
})

test('GET / lists jobs for the active workspace only', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  await Job.create({ workspaceId: workspace._id, createdBy: user._id, type: 'text', tier: 'standard' })
  await Job.create({ workspaceId: new mongoose.Types.ObjectId(), createdBy: user._id, type: 'text', tier: 'standard' })
  const res = await authed(request(app()).get('/api/jobs'), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
})

test('GET /:id 404 for a job in another workspace', async () => {
  const { token, workspace } = await makeAuthedUser()
  const foreign = await Job.create({ workspaceId: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId(), type: 'text', tier: 'standard' })
  const res = await authed(request(app()).get(`/api/jobs/${foreign._id}`), token, workspace._id)
  assert.equal(res.status, 404)
})
