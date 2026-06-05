// Client-side plan matrix — MIRRORS server/plans.js exactly.
// Single source of truth for the frontend: feature gates, upgrade CTAs, pricing display.
// Keep in sync with server/plans.js whenever the plan matrix changes.

export const PLANS = {
  free: {
    label: 'Free',
    credits: 25, premium: false, watermark: true, whiteLabel: false, maxSeats: 1,
    features: { text: true, image: true, voice: false, video: false, music: false, social: false, premiumTier: false },
    // Display-only pricing (must match Stripe dashboard)
    price: '$0/mo',
    displayFeatures: [
      'Text generation',
      'Image generation (standard)',
      'Watermark on exports',
      '25 credits/month',
      '1 workspace seat',
    ],
  },
  pro: {
    label: 'Pro',
    credits: 500, premium: true, watermark: false, whiteLabel: false, maxSeats: null,
    features: { text: true, image: true, voice: true, video: true, music: true, social: true, premiumTier: true },
    price: '$19/mo',
    displayFeatures: [
      'Text + image + voice + video',
      'Social post scheduling',
      'Premium AI tiers',
      'No watermark',
      '500 credits/month',
      'Team workspaces',
    ],
  },
  studio: {
    label: 'Studio',
    credits: 2000, premium: true, watermark: false, whiteLabel: true, maxSeats: null,
    features: { text: true, image: true, voice: true, video: true, music: true, social: true, premiumTier: true },
    price: '$79/mo',
    displayFeatures: [
      'Everything in Pro',
      'White-label branding',
      'API access',
      '2000 credits/month',
      'Dedicated support',
    ],
  },
}

// Credit pack pricing (must match Stripe dashboard)
export const CREDIT_PACKS = {
  pack_small:  { credits: 100,  price: '$4.99',  label: '100 credits' },
  pack_medium: { credits: 500,  price: '$19.99', label: '500 credits' },
  pack_large:  { credits: 2000, price: '$69.99', label: '2000 credits' },
}

/** Return the plan object for a given plan key (defaults to free). */
export function planFeatures(plan) { return PLANS[plan] || PLANS.free }

/** Return the credit allocation for a plan. */
export function planCredits(plan)  { return planFeatures(plan).credits }

/** Whether a plan unlocks a given capability key (text|image|voice|video|social|premiumTier). */
export function planAllows(plan, feature) { return !!planFeatures(plan).features?.[feature] }

/**
 * The minimum plan key that unlocks a feature.
 * Returns 'pro' or 'studio' for upsell prompts.
 */
export function minPlanFor(feature) {
  for (const key of ['free', 'pro', 'studio']) {
    if (planAllows(key, feature)) return key
  }
  return 'studio'
}

/** Human-readable label for a plan key. */
export function planLabel(plan) { return PLANS[plan]?.label ?? plan }

/** Feature display labels for UI copy. */
export const FEATURE_LABELS = {
  text:        'Text Generation',
  image:       'Image Generation',
  voice:       'Voice Generation',
  video:       'Video Generation',
  music:       'Music Generation',
  social:      'Social Distribution',
  premiumTier: 'Premium AI Tiers',
}
