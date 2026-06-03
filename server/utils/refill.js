import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'
import { planCredits } from '../plans.js'

export function currentPeriod(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

// Lazy monthly refill: when the calendar month rolls over, reset balance to plan allowance. No cron.
export async function applyMonthlyRefill(workspace, { now = new Date() } = {}) {
  const period = currentPeriod(now)
  if (workspace.creditPeriod === period) return workspace
  const allowance = planCredits(workspace.plan)
  const updated = await Workspace.findByIdAndUpdate(
    workspace._id,
    { $set: { creditBalance: allowance, creditPeriod: period } },
    { new: true },
  )
  await CreditTransaction.create({ workspaceId: workspace._id, amount: allowance, reason: 'grant', balanceAfter: allowance, note: `monthly refill ${period}` })
  return updated
}
