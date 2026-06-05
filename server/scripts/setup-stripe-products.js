// One-off: create the BookFilm products + prices in the configured Stripe account
// (idempotent via lookup_key) and write the resulting price IDs into .env.server.
// Run from server/:  node scripts/setup-stripe-products.js
// Amounts MUST match the client display (src/utils/plans.js). Test or live — uses STRIPE_SECRET_KEY.
import fs from 'fs'
import path from 'path'
import { getStripe } from '../utils/stripe.js'

const stripe = getStripe()
if (!stripe) { console.error('STRIPE_SECRET_KEY is not set in .env.server — cannot create products.'); process.exit(1) }

// unit_amount in cents (USD). pro/studio are per-seat recurring monthly; packs are one-time.
const DEFS = [
  { lookup: 'bookfilm_pro_monthly',    envKey: 'STRIPE_PRICE_PRO',         product: 'BookFilm Pro (per seat / month)',   unit_amount: 1900, recurring: { interval: 'month' } },
  { lookup: 'bookfilm_studio_monthly', envKey: 'STRIPE_PRICE_STUDIO',      product: 'BookFilm Studio (per seat / month)', unit_amount: 7900, recurring: { interval: 'month' } },
  { lookup: 'bookfilm_pack_small',     envKey: 'STRIPE_PRICE_PACK_SMALL',  product: 'BookFilm — 100 credits',  unit_amount: 499  },
  { lookup: 'bookfilm_pack_medium',    envKey: 'STRIPE_PRICE_PACK_MEDIUM', product: 'BookFilm — 500 credits',  unit_amount: 1999 },
  { lookup: 'bookfilm_pack_large',     envKey: 'STRIPE_PRICE_PACK_LARGE',  product: 'BookFilm — 2000 credits', unit_amount: 6999 },
]

const results = {}
for (const d of DEFS) {
  // Idempotent: reuse an existing price with the same lookup_key.
  const existing = await stripe.prices.list({ lookup_keys: [d.lookup], limit: 1, active: true })
  let price = existing.data[0]
  if (!price) {
    const product = await stripe.products.create({ name: d.product })
    price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: d.unit_amount,
      lookup_key: d.lookup,
      tax_behavior: 'exclusive',
      ...(d.recurring ? { recurring: d.recurring } : {}),
    })
    console.log(`created ${d.envKey} (${d.lookup}) = ${price.id}`)
  } else {
    console.log(`reused  ${d.envKey} (${d.lookup}) = ${price.id}`)
  }
  results[d.envKey] = price.id
}

// Write the price IDs into .env.server (replace existing lines or append).
const envPath = path.resolve(process.cwd(), '.env.server')
let env = fs.readFileSync(envPath, 'utf8')
for (const [k, v] of Object.entries(results)) {
  const re = new RegExp(`^${k}=.*$`, 'm')
  env = re.test(env) ? env.replace(re, `${k}=${v}`) : env + (env.endsWith('\n') ? '' : '\n') + `${k}=${v}\n`
}
fs.writeFileSync(envPath, env)
console.log('\n✓ Wrote 5 STRIPE_PRICE_* IDs into .env.server. Restart the server for them to take effect.')
