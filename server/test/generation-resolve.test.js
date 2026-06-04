import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, resolveProviders } from '../generation/resolve.js'

test('resolve returns the tier entry with providers array for text/standard', () => {
  const std = resolve('text', 'standard')
  assert.ok(Array.isArray(std.providers), 'providers should be an array')
  assert.equal(std.providers[0].provider, 'groq')
  assert.equal(typeof std.providers[0].adapter.generate, 'function')
  // groq is first (free tier), gemini is second fallback, deepseek is third
  const providerNames = new Set(std.providers.map(p => p.provider))
  assert.ok(providerNames.has('gemini'), 'text/standard should include gemini fallback')
  assert.ok(providerNames.has('deepseek'), 'text/standard should include deepseek fallback')
  assert.equal(std.providers[0].provider, 'groq', 'groq should be first in text/standard')
})

test('resolve returns the tier entry with providers array for text/premium', () => {
  const prem = resolve('text', 'premium')
  assert.ok(Array.isArray(prem.providers))
  assert.equal(prem.providers[0].provider, 'anthropic')
  assert.equal(typeof prem.providers[0].adapter.generate, 'function')
})

test('resolve returns video adapters per tier', () => {
  const std = resolve('video', 'standard')
  assert.ok(Array.isArray(std.providers))
  assert.equal(std.providers[0].provider, 'replicate')
  assert.equal(typeof std.providers[0].adapter.generate, 'function')
  const prem = resolve('video', 'premium')
  assert.equal(prem.providers[0].provider, 'falai')
  assert.equal(typeof prem.providers[0].adapter.generate, 'function')
  // both tiers include runway and luma as fallbacks
  const stdNames = new Set(std.providers.map(p => p.provider))
  const premNames = new Set(prem.providers.map(p => p.provider))
  assert.ok(stdNames.has('runway'), 'video/standard should include runway fallback')
  assert.ok(stdNames.has('luma'),   'video/standard should include luma fallback')
  assert.ok(premNames.has('runway'), 'video/premium should include runway fallback')
  assert.ok(premNames.has('luma'),   'video/premium should include luma fallback')
})

test('resolve returns voice adapters with openai first in standard, googletts second, elevenlabs third', () => {
  const std = resolve('voice', 'standard')
  assert.equal(std.providers[0].provider, 'openai')
  assert.equal(std.providers[1].provider, 'googletts')
  assert.equal(std.providers[2].provider, 'elevenlabs')
  const prem = resolve('voice', 'premium')
  assert.equal(prem.providers[0].provider, 'elevenlabs')
  // standard chain includes googletts
  const stdNames = new Set(std.providers.map(p => p.provider))
  assert.ok(stdNames.has('googletts'), 'voice/standard should include googletts fallback')
})

test('resolve entries carry credits', () => {
  assert.equal(resolve('text', 'standard').credits, 1)
  assert.equal(resolve('text', 'premium').credits, 3)
  assert.equal(resolve('image', 'standard').credits, 4)
  assert.equal(resolve('image', 'premium').credits, 10)
  assert.equal(resolve('voice', 'standard').credits, 1)
  assert.equal(resolve('voice', 'premium').credits, 5)
  assert.equal(resolve('video', 'standard').credits, 20)
  assert.equal(resolve('video', 'premium').credits, 40)
})

test('resolveProviders is a convenience shorthand returning the providers array', () => {
  const providers = resolveProviders('text', 'standard')
  assert.ok(Array.isArray(providers))
  assert.equal(providers[0].provider, 'groq')
})

test('resolve throws on unknown type or tier', () => {
  assert.throws(() => resolve('text', 'ultra'))
  assert.throws(() => resolve('hologram', 'standard'))
})
