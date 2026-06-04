import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import authRoutes from '../routes/auth.js'
import { config } from '../config.js'
import User from '../models/User.js'

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

const ADMIN = 'boss@example.com'
const reg = (email) => ({ name: 'X', email, password: 'password1234', consent: true })

test('registering with the configured ADMIN_EMAIL grants the admin role', async () => {
  config.admin.email = ADMIN
  const res = await request(app()).post('/api/auth/register').send(reg(ADMIN))
  assert.equal(res.status, 201)
  assert.equal(res.body.user.role, 'admin')
})

test('registering with a different email stays a normal user', async () => {
  config.admin.email = ADMIN
  const res = await request(app()).post('/api/auth/register').send(reg('someone@else.com'))
  assert.equal(res.status, 201)
  assert.equal(res.body.user.role, 'user')
})

test('an existing non-admin user matching ADMIN_EMAIL is promoted on login', async () => {
  config.admin.email = ADMIN
  // create the account while it is NOT the admin email, then flip the config
  config.admin.email = 'nobody@nowhere.com'
  await request(app()).post('/api/auth/register').send(reg(ADMIN))
  let u = await User.findOne({ email: ADMIN })
  assert.equal(u.role, 'user')
  config.admin.email = ADMIN
  const res = await request(app()).post('/api/auth/login').send({ email: ADMIN, password: 'password1234' })
  assert.equal(res.status, 200)
  assert.equal(res.body.user.role, 'admin')
  u = await User.findOne({ email: ADMIN })
  assert.equal(u.role, 'admin')
})
