import './helpers/env.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateBestOfN } from '../generation/bestOfN.js'

// Fake adapter factory: generate() returns a distinct media-shaped result.
function adapter({ tag, configured = true, fail = false }) {
  return {
    isConfigured: () => configured,
    generate: async () => {
      if (fail) throw new Error(`${tag} failed`)
      return { buffer: Buffer.from(tag), mimeType: 'image/png', ext: 'png' }
    },
  }
}

// Score by reading the buffer tag → lets tests control the winner deterministically.
const scoreByTag = (map) => async ({ buffer }) => map[buffer.toString()] ?? 0.5

test('bestOfN: returns the highest-scoring candidate', async () => {
  const providers = [
    { provider: 'a', adapter: adapter({ tag: 'A' }), model: 'm' },
    { provider: 'b', adapter: adapter({ tag: 'B' }), model: 'm' },
    { provider: 'c', adapter: adapter({ tag: 'C' }), model: 'm' },
  ]
  const { result, provider } = await generateBestOfN({
    providers, payload: { prompt: 'x' }, type: 'image', n: 3, isPaidPlan: false,
    scoreFn: scoreByTag({ A: 0.2, B: 0.9, C: 0.4 }),
  })
  assert.equal(provider, 'b')
  assert.equal(result.buffer.toString(), 'B')
})

test('bestOfN: ties resolve to the first candidate', async () => {
  const providers = [
    { provider: 'a', adapter: adapter({ tag: 'A' }), model: 'm' },
    { provider: 'b', adapter: adapter({ tag: 'B' }), model: 'm' },
  ]
  const { provider } = await generateBestOfN({
    providers, payload: {}, type: 'image', n: 2, isPaidPlan: false,
    scoreFn: scoreByTag({ A: 0.5, B: 0.5 }),
  })
  assert.equal(provider, 'a')
})

test('bestOfN: n=1 returns the single (first usable) candidate without scoring', async () => {
  let scored = false
  const providers = [
    { provider: 'a', adapter: adapter({ tag: 'A' }), model: 'm' },
    { provider: 'b', adapter: adapter({ tag: 'B' }), model: 'm' },
  ]
  const { provider } = await generateBestOfN({
    providers, payload: {}, type: 'image', n: 1, isPaidPlan: false,
    scoreFn: async () => { scored = true; return 1 },
  })
  assert.equal(provider, 'a')
  assert.equal(scored, false, 'single candidate must not be scored')
})

test('bestOfN: single configured provider returns that one', async () => {
  const providers = [
    { provider: 'a', adapter: adapter({ tag: 'A', configured: false }), model: 'm' },
    { provider: 'b', adapter: adapter({ tag: 'B' }), model: 'm' },
  ]
  const { provider, result } = await generateBestOfN({
    providers, payload: {}, type: 'image', n: 3, isPaidPlan: false,
    scoreFn: async () => 1,
  })
  assert.equal(provider, 'b')
  assert.equal(result.buffer.toString(), 'B')
})

test('bestOfN: skips unconfigured providers when selecting candidates', async () => {
  let aCalled = false
  const aAdapter = adapter({ tag: 'A', configured: false })
  aAdapter.generate = async () => { aCalled = true; return { buffer: Buffer.from('A'), mimeType: 'image/png' } }
  const providers = [
    { provider: 'a', adapter: aAdapter, model: 'm' },
    { provider: 'b', adapter: adapter({ tag: 'B' }), model: 'm' },
    { provider: 'c', adapter: adapter({ tag: 'C' }), model: 'm' },
  ]
  const { provider } = await generateBestOfN({
    providers, payload: {}, type: 'image', n: 3, isPaidPlan: false,
    scoreFn: scoreByTag({ B: 0.3, C: 0.8 }),
  })
  assert.equal(aCalled, false, 'unconfigured provider must not be generated')
  assert.equal(provider, 'c')
})

test('bestOfN: skips freeOnly providers for paid plans', async () => {
  let freeCalled = false
  const freeAdapter = adapter({ tag: 'FREE' })
  freeAdapter.generate = async () => { freeCalled = true; return { buffer: Buffer.from('FREE'), mimeType: 'image/png' } }
  const providers = [
    { provider: 'free', adapter: freeAdapter, model: 'm', freeOnly: true },
    { provider: 'paid', adapter: adapter({ tag: 'PAID' }), model: 'm' },
  ]
  const { provider } = await generateBestOfN({
    providers, payload: {}, type: 'image', n: 3, isPaidPlan: true,
    scoreFn: async () => 0.5,
  })
  assert.equal(freeCalled, false, 'freeOnly provider must be skipped on paid plan')
  assert.equal(provider, 'paid')
})

test('bestOfN: freeOnly provider IS used on free plan', async () => {
  const providers = [
    { provider: 'free', adapter: adapter({ tag: 'FREE' }), model: 'm', freeOnly: true },
    { provider: 'paid', adapter: adapter({ tag: 'PAID' }), model: 'm' },
  ]
  const { provider } = await generateBestOfN({
    providers, payload: {}, type: 'image', n: 3, isPaidPlan: false,
    scoreFn: scoreByTag({ FREE: 0.9, PAID: 0.1 }),
  })
  assert.equal(provider, 'free')
})

test('bestOfN: respects n cap (only first n usable providers are tried)', async () => {
  const calls = []
  const mk = (tag) => {
    const a = adapter({ tag })
    a.generate = async () => { calls.push(tag); return { buffer: Buffer.from(tag), mimeType: 'image/png' } }
    return a
  }
  const providers = [
    { provider: 'a', adapter: mk('A'), model: 'm' },
    { provider: 'b', adapter: mk('B'), model: 'm' },
    { provider: 'c', adapter: mk('C'), model: 'm' },
  ]
  await generateBestOfN({
    providers, payload: {}, type: 'image', n: 2, isPaidPlan: false,
    scoreFn: async () => 0.5,
  })
  assert.deepEqual(calls, ['A', 'B'], 'only the first n=2 usable providers should be generated')
})

test('bestOfN: text type returns first success without scoring', async () => {
  let scored = false
  const providers = [
    { provider: 'a', adapter: { isConfigured: () => true, generate: async () => 'TEXT-A' }, model: 'm' },
    { provider: 'b', adapter: { isConfigured: () => true, generate: async () => 'TEXT-B' }, model: 'm' },
  ]
  const { provider, result } = await generateBestOfN({
    providers, payload: {}, type: 'text', n: 3, isPaidPlan: false,
    scoreFn: async () => { scored = true; return 1 },
  })
  assert.equal(provider, 'a')
  assert.equal(result, 'TEXT-A')
  assert.equal(scored, false)
})

test('bestOfN: zero candidates (all throw) rethrows the last error', async () => {
  const providers = [
    { provider: 'a', adapter: adapter({ tag: 'A', fail: true }), model: 'm' },
    { provider: 'b', adapter: adapter({ tag: 'B', fail: true }), model: 'm' },
  ]
  await assert.rejects(
    () => generateBestOfN({ providers, payload: {}, type: 'image', n: 3, isPaidPlan: false, scoreFn: async () => 1 }),
    /B failed/
  )
})

test('bestOfN: zero usable providers (all unconfigured) throws', async () => {
  const providers = [
    { provider: 'a', adapter: adapter({ tag: 'A', configured: false }), model: 'm' },
    { provider: 'b', adapter: adapter({ tag: 'B', configured: false }), model: 'm' },
  ]
  await assert.rejects(
    () => generateBestOfN({ providers, payload: {}, type: 'image', n: 3, isPaidPlan: false, scoreFn: async () => 1 }),
    /No configured provider/
  )
})

test('bestOfN: a throwing scorer falls back to neutral and still picks a candidate', async () => {
  const providers = [
    { provider: 'a', adapter: adapter({ tag: 'A' }), model: 'm' },
    { provider: 'b', adapter: adapter({ tag: 'B' }), model: 'm' },
  ]
  const { provider } = await generateBestOfN({
    providers, payload: {}, type: 'image', n: 3, isPaidPlan: false,
    scoreFn: async () => { throw new Error('scorer down') },
  })
  // All neutral (0.5) due to scorer errors → tie → first.
  assert.equal(provider, 'a')
})
