import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import Workspace from '../models/Workspace.js'
import ProcessedWebhookEvent from '../models/ProcessedWebhookEvent.js'
import { getStripe, planForPriceId } from '../utils/stripe.js'
import { grantCredits } from '../utils/credits.js'
import { config } from '../config.js'

export const billingRouter = Router()
billingRouter.use(requireAuth, resolveWorkspace)

// POST /api/billing/checkout  { kind: 'subscription'|'pack', key }
billingRouter.post('/checkout', async (req, res) => {
  try {
    const stripe = req.app.locals.stripe || getStripe()
    if (!stripe) return res.status(503).json({ error: 'Billing not configured' })
    const { kind, key } = req.body
    let priceId, mode
    if (kind === 'subscription') {
      if (!['pro', 'studio'].includes(key)) return res.status(400).json({ error: 'Invalid plan' })
      priceId = config.stripe.prices[key]; mode = 'subscription'
    } else if (kind === 'pack') {
      if (!config.stripe.packCredits[key]) return res.status(400).json({ error: 'Invalid pack' })
      priceId = config.stripe.prices[key]; mode = 'payment'
    } else {
      return res.status(400).json({ error: 'Invalid kind' })
    }
    if (!priceId) return res.status(503).json({ error: 'Price not configured' })

    let customerId = req.workspace.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { workspaceId: String(req.workspace._id) } })
      customerId = customer.id
      await Workspace.findByIdAndUpdate(req.workspace._id, { stripeCustomerId: customerId })
    }
    const session = await stripe.checkout.sessions.create({
      mode, customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.clientUrl}/?billing=success`,
      cancel_url: `${config.clientUrl}/?billing=cancel`,
      metadata: { workspaceId: String(req.workspace._id), kind, key },
      ...(mode === 'subscription' ? { subscription_data: { metadata: { workspaceId: String(req.workspace._id) } } } : {}),
    })
    res.json({ url: session.url })
  } catch (err) { console.error('checkout error:', err); res.status(500).json({ error: 'Server error' }) }
})

// GET /api/billing/portal
billingRouter.get('/portal', async (req, res) => {
  try {
    const stripe = req.app.locals.stripe || getStripe()
    if (!stripe) return res.status(503).json({ error: 'Billing not configured' })
    if (!req.workspace.stripeCustomerId) return res.status(400).json({ error: 'No billing account yet' })
    const session = await stripe.billingPortal.sessions.create({ customer: req.workspace.stripeCustomerId, return_url: `${config.clientUrl}/` })
    res.json({ url: session.url })
  } catch (err) { console.error('portal error:', err); res.status(500).json({ error: 'Server error' }) }
})

// Webhook — RAW body, no auth. constructEvent injectable for tests via app.locals.constructEvent.
export async function webhookHandler(req, res) {
  const stripe = req.app.locals.stripe || getStripe()
  const constructEvent = req.app.locals.constructEvent
  let event
  try {
    if (constructEvent) event = constructEvent(req.body, req.headers['stripe-signature'])
    else if (stripe) event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripe.webhookSecret)
    else return res.status(503).json({ error: 'Billing not configured' })
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature verification failed' })
  }

  // Idempotency: unique eventId. If already processed, ack without re-applying.
  try { await ProcessedWebhookEvent.create({ eventId: event.id, type: event.type }) }
  catch (_) { return res.json({ received: true, duplicate: true }) }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object
      const workspaceId = s.metadata?.workspaceId
      if (s.mode === 'payment' && workspaceId) {
        const credits = config.stripe.packCredits[s.metadata?.key]
        if (credits) await grantCredits(workspaceId, credits, { bucket: 'purchased', note: `pack ${s.metadata?.key}` })
      } else if (s.mode === 'subscription' && workspaceId) {
        await Workspace.findByIdAndUpdate(workspaceId, { stripeCustomerId: s.customer, stripeSubscriptionId: s.subscription })
      }
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object
      const priceId = sub.items?.data?.[0]?.price?.id
      const plan = planForPriceId(priceId)
      const active = ['active', 'trialing'].includes(sub.status)
      let targetId = sub.metadata?.workspaceId
      if (!targetId) { const ws = await Workspace.findOne({ stripeCustomerId: sub.customer }); targetId = ws?._id }
      if (targetId) await Workspace.findByIdAndUpdate(targetId, { plan: active && plan ? plan : 'free', stripeSubscriptionId: sub.id })
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const ws = await Workspace.findOne({ stripeCustomerId: sub.customer })
      if (ws) await Workspace.findByIdAndUpdate(ws._id, { plan: 'free' })
    }
    res.json({ received: true })
  } catch (err) { console.error('webhook handler error:', err); res.status(500).json({ error: 'Server error' }) }
}
