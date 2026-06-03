export const PLANS = {
  free:   { credits: 25,   premium: false, watermark: true,  whiteLabel: false, maxSeats: 1    },
  pro:    { credits: 500,  premium: true,  watermark: false, whiteLabel: false, maxSeats: null },
  studio: { credits: 2000, premium: true,  watermark: false, whiteLabel: true,  maxSeats: null },
}
export function planFeatures(plan) { return PLANS[plan] || PLANS.free }
export function planCredits(plan)  { return planFeatures(plan).credits }
export function planMaxSeats(plan) { return planFeatures(plan).maxSeats }
