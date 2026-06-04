import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import authRoutes from '../routes/auth.js'
import Workspace from '../models/Workspace.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function app() {
  const a = express()
  a.use(express.json())
  a.use(cookieParser())
  a.use('/api/auth', authRoutes)
  return a
}

test('register creates a personal workspace and returns defaultWorkspaceId', async () => {
  const res = await request(app())
    .post('/api/auth/register')
    .send({ name: 'Jane', email: 'jane@x.com', password: 'password1234', consent: true })

  assert.equal(res.status, 201)
  assert.ok(res.body.user.defaultWorkspaceId, 'user has a default workspace')

  const ws = await Workspace.findById(res.body.user.defaultWorkspaceId)
  assert.equal(ws.type, 'personal')
  assert.equal(ws.getMemberRole(res.body.user._id), 'owner')

  const count = await Workspace.countDocuments({})
  assert.equal(count, 1)
})
