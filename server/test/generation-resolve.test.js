import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from '../generation/resolve.js'

test('resolve returns the cost-first text adapters per tier', () => {
  const std = resolve('text', 'standard')
  assert.equal(std.provider, 'groq')
  assert.equal(typeof std.adapter.generate, 'function')
  const prem = resolve('text', 'premium')
  assert.equal(prem.provider, 'anthropic')
  assert.equal(typeof prem.adapter.generate, 'function')
})

test('resolve returns video adapters per tier', () => {
  const std = resolve('video', 'standard')
  assert.equal(std.provider, 'replicate')
  assert.equal(typeof std.adapter.generate, 'function')
  const prem = resolve('video', 'premium')
  assert.equal(prem.provider, 'falai')
  assert.equal(typeof prem.adapter.generate, 'function')
})

test('resolve throws on unknown type or tier', () => {
  assert.throws(() => resolve('text', 'ultra'))
  assert.throws(() => resolve('hologram', 'standard'))
})
