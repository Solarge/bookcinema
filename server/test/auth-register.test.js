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
    .send({ name: 'Jane', email: 'jane@x.com', password: 'password1234', consent: true, ageConfirmed: true })

  assert.equal(res.status, 201)
  assert.ok(res.body.user.defaultWorkspaceId, 'user has a default workspace')

  const ws = await Workspace.findById(res.body.user.defaultWorkspaceId)
  assert.equal(ws.type, 'personal')
  assert.equal(ws.getMemberRole(res.body.user._id), 'owner')

  const count = await Workspace.countDocuments({})
  assert.equal(count, 1)
})

test('register without ageConfirmed returns 400', async () => {
  const res = await request(app())
    .post('/api/auth/register')
    .send({ name: 'Bob', email: 'bob@x.com', password: 'password1234', consent: true })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /16 or older/)
})

test('register with ageConfirmed stamps ageConfirmedAt', async () => {
  const res = await request(app())
    .post('/api/auth/register')
    .send({ name: 'Alice', email: 'alice@x.com', password: 'password1234', consent: true, ageConfirmed: true })
  assert.equal(res.status, 201)
  // Reload from DB to confirm ageConfirmedAt is set (toSafeObject doesn't expose it, check DB directly)
  const User = (await import('../models/User.js')).default
  const user = await User.findById(res.body.user._id)
  assert.ok(user.ageConfirmedAt instanceof Date, 'ageConfirmedAt should be a Date')
})

test('register with marketingConsent stamps marketingConsentAt', async () => {
  const res = await request(app())
    .post('/api/auth/register')
    .send({ name: 'Carol', email: 'carol@x.com', password: 'password1234', consent: true, ageConfirmed: true, marketingConsent: true })
  assert.equal(res.status, 201)
  const User = (await import('../models/User.js')).default
  const user = await User.findById(res.body.user._id)
  assert.ok(user.marketingConsentAt instanceof Date, 'marketingConsentAt should be a Date')
})

test('register without marketingConsent leaves marketingConsentAt null', async () => {
  const res = await request(app())
    .post('/api/auth/register')
    .send({ name: 'Dave', email: 'dave@x.com', password: 'password1234', consent: true, ageConfirmed: true })
  assert.equal(res.status, 201)
  const User = (await import('../models/User.js')).default
  const user = await User.findById(res.body.user._id)
  assert.equal(user.marketingConsentAt, null)
})
