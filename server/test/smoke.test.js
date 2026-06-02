import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB } from './helpers/db.js'

before(startTestDB)
after(stopTestDB)

test('in-memory mongo connects', () => {
  assert.equal(mongoose.connection.readyState, 1) // 1 = connected
})
