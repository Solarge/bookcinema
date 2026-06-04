// Plan → feature matrix. SINGLE SOURCE OF TRUTH for what each subscribed plan unlocks.
// Everything is managed (server-side); features are gated by the plan the tenant is on.
// Adjust freely here — server enforcement (generate/social routes) and the client UI both read this.
export const PLANS = {
  free: {
    label: 'Free',
    credits: 25, premium: false, watermark: true, whiteLabel: false, maxSeats: 1,
    // Capabilities unlocked at this plan:
    features: { text: true, image: true, voice: false, video: false, social: false, premiumTier: false },
  },
  pro: {
    label: 'Pro',
    credits: 500, premium: true, watermark: false, whiteLabel: false, maxSeats: null,
    features: { text: true, image: true, voice: true, video: true, social: true, premiumTier: true },
  },
  studio: {
    label: 'Studio',
    credits: 2000, premium: true, watermark: false, whiteLabel: true, maxSeats: null,
    features: { text: true, image: true, voice: true, video: true, social: true, premiumTier: true },
  },
}

export function planFeatures(plan) { return PLANS[plan] || PLANS.free }
export function planCredits(plan)  { return planFeatures(plan).credits }
export function planMaxSeats(plan) { return planFeatures(plan).maxSeats }

// Whether a plan unlocks a given capability key (text|image|voice|video|social|premiumTier).
export function planAllows(plan, feature) { return !!planFeatures(plan).features?.[feature] }

// Human-readable: the minimum plan that unlocks a feature (for "Upgrade to X" prompts).
export function minPlanFor(feature) {
  for (const key of ['free', 'pro', 'studio']) {
    if (planAllows(key, feature)) return key
  }
  return 'studio'
}
