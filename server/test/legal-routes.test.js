import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import authRoutes from '../routes/auth.js'
import userRoutes from '../routes/users.js'
import Workspace from '../models/Workspace.js'
import Series from '../models/Series.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function authApp() {
  const a = express()
  a.use(express.json())
  a.use(cookieParser())
  a.use('/api/auth', authRoutes)
  return a
}

function userApp() {
  const a = express()
  a.use(express.json())
  a.use('/api/users', userRoutes)
  return a
}

const authed = (r, t) => r.set('Authorization', `Bearer ${t}`)

test('register requires consent (400 without it)', async () => {
  const res = await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'A', email: 'a@x.com', password: 'password1234' })
  assert.equal(res.status, 400)
})

test('register stamps consentedAt when consent given', async () => {
  const res = await request(authApp())
    .post('/api/auth/register')
    .send({ name: 'A', email: 'b@x.com', password: 'password1234', consent: true, ageConfirmed: true })
  assert.equal(res.status, 201)
  assert.ok(res.body.user.consentedAt)
})

test('GET /me/export returns the user data bundle', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'S', fullOutput: {} })
  const res = await authed(request(userApp()).get('/api/users/me/export'), token)
  assert.equal(res.status, 200)
  assert.equal(res.body.user.email, user.email)
  assert.ok(Array.isArray(res.body.workspaces))
  assert.ok(Array.isArray(res.body.series))
  assert.equal(res.body.series.length, 1)
})

test('DELETE /me erases the user + personal workspace + series', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'S', fullOutput: {} })
  const res = await authed(request(userApp()).delete('/api/users/me'), token)
  assert.equal(res.status, 200)
  const { default: User } = await import('../models/User.js')
  assert.equal(await User.countDocuments({ _id: user._id }), 0)
  assert.equal(await Workspace.countDocuments({ _id: workspace._id }), 0)
  assert.equal(await Series.countDocuments({ workspaceId: workspace._id }), 0)
})

test('DELETE /me blocks if user solely-owns an org with other members (409)', async () => {
  const { user, token } = await makeAuthedUser()
  await Workspace.create({
    name: 'Org',
    type: 'organization',
    ownerId: user._id,
    members: [
      { userId: user._id, role: 'owner' },
      { userId: new mongoose.Types.ObjectId(), role: 'member' },
    ],
  })
  const res = await authed(request(userApp()).delete('/api/users/me'), token)
  assert.equal(res.status, 409)
})
