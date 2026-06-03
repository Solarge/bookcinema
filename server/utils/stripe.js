import Stripe from 'stripe'
import { config } from '../config.js'

let _stripe = null
// Lazily construct the Stripe client; returns null if no secret key configured.
export function getStripe() {
  if (_stripe) return _stripe
  if (!config.stripe.secretKey) return null
  _stripe = new Stripe(config.stripe.secretKey)
  return _stripe
}

// Map a subscription price id -> plan ('pro'|'studio'), or null.
export function planForPriceId(priceId) {
  const p = config.stripe.prices
  if (priceId && priceId === p.pro) return 'pro'
  if (priceId && priceId === p.studio) return 'studio'
  return null
}

// Map a one-time pack price id -> { key, credits }, or null.
export function packForPriceId(priceId) {
  const p = config.stripe.prices
  for (const key of ['pack_small', 'pack_medium', 'pack_large']) {
    if (priceId && priceId === p[key]) return { key, credits: config.stripe.packCredits[key] }
  }
  return null
}
