import Workspace from '../models/Workspace.js'
import CreditTransaction from '../models/CreditTransaction.js'
import { sendEmail, lowCreditEmail } from './email.js'
import { config } from '../config.js'

const LOW_CREDIT_THRESHOLD = 20

// Atomic debit: requires monthly+purchased >= amount; draws monthly-first, then purchased.
// Returns { ok, balance, fromMonthly, fromPurchased } so callers can refund to the correct bucket.
export async function debitCredits(workspaceId, amount, { type = null, tier = null, jobId = null } = {}) {
  // We need the pre-update state to compute bucket split, so read first then atomic update.
  // The $expr filter ensures atomicity: if balance drops below amount between read and update,
  // the update won't match and we return { ok: false }.
  const before = await Workspace.findOne(
    { _id: workspaceId, $expr: { $gte: [{ $add: ['$monthlyCredits', '$purchasedCredits'] }, amount] } },
    { monthlyCredits: 1, purchasedCredits: 1 },
  )
  if (!before) return { ok: false }
  // Compute how much comes from each bucket (monthly drawn first)
  const fromMonthly = Math.min(before.monthlyCredits, amount)
  const fromPurchased = amount - fromMonthly
  const ws = await Workspace.findOneAndUpdate(
    { _id: workspaceId, $expr: { $gte: [{ $add: ['$monthlyCredits', '$purchasedCredits'] }, amount] } },
    [{ $set: {
      purchasedCredits: { $cond: [ { $gte: ['$monthlyCredits', amount] }, '$purchasedCredits',
        { $subtract: ['$purchasedCredits', { $subtract: [amount, '$monthlyCredits'] }] } ] },
      monthlyCredits: { $max: [0, { $subtract: ['$monthlyCredits', amount] }] },
    } }],
    { new: true },
  )
  if (!ws) return { ok: false }
  const balanceAfter = ws.monthlyCredits + ws.purchasedCredits
  await CreditTransaction.create({ workspaceId, amount: -amount, reason: 'debit', type, tier, jobId, balanceAfter })

  // Low-credit notification — best-effort, never block the debit
  // Fire once per billing period: only when crossing below threshold for the first time.
  const balanceBefore = before.monthlyCredits + before.purchasedCredits
  if (balanceBefore >= LOW_CREDIT_THRESHOLD && balanceAfter < LOW_CREDIT_THRESHOLD && !ws.lowCreditNotifiedAt) {
    try {
      const currentPeriodStr = ws.creditPeriod || null
      // Mark notified immediately to avoid racing concurrent debits
      await Workspace.findByIdAndUpdate(ws._id, { lowCreditNotifiedAt: new Date() })
      const User = (await import('../models/User.js')).default
      const owner = await User.findById(ws.ownerId)
      if (owner) {
        const billingUrl = `${config.clientUrl}/?billing=portal`
        await sendEmail({
          to: owner.email,
          subject: 'Your BookFilm Studio credits are running low',
          html: lowCreditEmail(owner.name, balanceAfter, billingUrl),
        })
      }
    } catch (err) {
      console.warn('[credits] low-credit email failed (non-fatal):', err.message)
    }
  }

  return { ok: true, balance: balanceAfter, fromMonthly, fromPurchased }
}

// Refund returns credits to the specified bucket ('monthly' | 'purchased', default 'monthly').
// Callers that know which bucket was drawn (via debitCredits return values) should pass the
// correct bucket. This prevents over-crediting the monthly allowance (which resets periodically)
// when purchased credits were actually consumed.
export async function refundCredits(workspaceId, amount, { jobId = null, type = null, tier = null, bucket = 'monthly' } = {}) {
  const field = bucket === 'purchased' ? 'purchasedCredits' : 'monthlyCredits'
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { [field]: amount } }, { new: true })
  if (!ws) return { ok: false }
  const balanceAfter = ws.monthlyCredits + ws.purchasedCredits
  await CreditTransaction.create({ workspaceId, amount, reason: 'refund', type, tier, jobId, balanceAfter })
  return { ok: true, balance: balanceAfter }
}

// Grant to a bucket: 'purchased' (packs) or 'monthly' (admin/allowance). Default purchased.
export async function grantCredits(workspaceId, amount, { note = '', bucket = 'purchased' } = {}) {
  const field = bucket === 'monthly' ? 'monthlyCredits' : 'purchasedCredits'
  const ws = await Workspace.findByIdAndUpdate(workspaceId, { $inc: { [field]: amount } }, { new: true })
  if (!ws) return { ok: false }
  const balanceAfter = ws.monthlyCredits + ws.purchasedCredits
  await CreditTransaction.create({ workspaceId, amount, reason: 'grant', balanceAfter, note })
  return { ok: true, balance: balanceAfter }
}
