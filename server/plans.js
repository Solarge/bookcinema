export const PLANS = {
  free:   { credits: 25,   premium: false, watermark: true,  whiteLabel: false },
  pro:    { credits: 500,  premium: true,  watermark: false, whiteLabel: false },
  studio: { credits: 2000, premium: true,  watermark: false, whiteLabel: true  },
}
export function planFeatures(plan) { return PLANS[plan] || PLANS.free }
export function planCredits(plan)  { return planFeatures(plan).credits }
