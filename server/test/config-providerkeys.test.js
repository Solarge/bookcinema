import './helpers/env.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../config.js'

test('config exposes providerKeys without throwing when keys are absent', () => {
  assert.ok(config.providerKeys, 'providerKeys present')
  assert.equal('groq' in config.providerKeys, true)
  assert.equal('anthropic' in config.providerKeys, true)
})
