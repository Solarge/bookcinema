import { getStripe } from './stripe.js'

// Seat count = members of an organization workspace (personal = always 1).
export function seatCount(workspace) {
  if (!workspace) return 1
  if (workspace.type !== 'organization') return 1
  return (workspace.members || []).length || 1
}

// Best-effort: set the workspace's Stripe subscription quantity to its seat count.
// No-op if no subscription, not an org, or Stripe unavailable. Never throws.
export async function syncSeats(workspace, { stripe } = {}) {
  try {
    const s = stripe || getStripe()
    if (!s) return { synced: false, reason: 'no-stripe' }
    if (!workspace || workspace.type !== 'organization' || !workspace.stripeSubscriptionId) {
      return { synced: false, reason: 'no-subscription' }
    }
    const sub = await s.subscriptions.retrieve(workspace.stripeSubscriptionId)
    const item = sub.items?.data?.[0]
    if (!item) return { synced: false, reason: 'no-item' }
    const quantity = seatCount(workspace)
    if (item.quantity === quantity) return { synced: true, quantity, unchanged: true }
    await s.subscriptions.update(workspace.stripeSubscriptionId, {
      items: [{ id: item.id, quantity }],
      proration_behavior: 'create_prorations',
    })
    return { synced: true, quantity }
  } catch (err) {
    console.error('syncSeats error:', err.message)
    return { synced: false, reason: 'error', error: err.message }
  }
}
