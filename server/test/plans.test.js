import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFeatures, planCredits } from '../plans.js'

test('plan features per tier', () => {
  assert.equal(planFeatures('free').premium, false)
  assert.equal(planFeatures('free').watermark, true)
  assert.equal(planFeatures('pro').premium, true)
  assert.equal(planFeatures('pro').watermark, false)
  assert.equal(planFeatures('studio').whiteLabel, true)
  assert.equal(planFeatures('free').whiteLabel, false)
})
test('plan credits per tier', () => {
  assert.equal(planCredits('free'), 25)
  assert.equal(planCredits('pro'), 500)
  assert.equal(planCredits('studio'), 2000)
})
test('unknown plan falls back to free', () => {
  assert.equal(planCredits('bogus'), 25)
  assert.equal(planFeatures(undefined).premium, false)
})
