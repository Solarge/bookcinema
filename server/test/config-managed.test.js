import './helpers/env.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../config.js'

test('config.managed has sane defaults when env unset', () => {
  assert.equal(typeof config.managed.enabled, 'boolean')
  assert.equal(config.managed.caps.text > 0, true)
  assert.equal(config.managed.maxConcurrent > 0, true)
})
