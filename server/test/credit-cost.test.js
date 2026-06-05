import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creditCost } from '../generation/creditCost.js'

test('creditCost returns cost-weighted credits per type/tier', () => {
  assert.equal(creditCost('text', 'standard'), 1)
  assert.equal(creditCost('text', 'premium'), 3)
  assert.equal(creditCost('voice', 'standard'), 1)
  assert.equal(creditCost('voice', 'premium'), 5)
  assert.equal(creditCost('image', 'standard'), 4)
  assert.equal(creditCost('image', 'premium'), 10)
  assert.equal(creditCost('video', 'standard'), 40)
  assert.equal(creditCost('video', 'premium'), 80)
})
test('creditCost throws on unknown type/tier', () => {
  assert.throws(() => creditCost('text', 'ultra'))
})
