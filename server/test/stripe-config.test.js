import './helpers/env.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../config.js'
import { planForPriceId, packForPriceId } from '../utils/stripe.js'

test('config.stripe has expected shape', () => {
  assert.equal(typeof config.stripe.secretKey, 'string')
  assert.ok(config.stripe.prices)
  assert.equal(config.stripe.packCredits.pack_small, 100)
})
test('planForPriceId + packForPriceId map via config.stripe.prices', () => {
  // Override the in-memory config price ids for the test
  config.stripe.prices.pro = 'price_pro_x'
  config.stripe.prices.pack_medium = 'price_pack_med'
  assert.equal(planForPriceId('price_pro_x'), 'pro')
  assert.equal(planForPriceId('nope'), null)
  const pack = packForPriceId('price_pack_med')
  assert.equal(pack.key, 'pack_medium')
  assert.equal(pack.credits, 500)
  assert.equal(packForPriceId('nope'), null)
})
