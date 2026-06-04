import Job from '../models/Job.js'
import { creditCost } from '../generation/creditCost.js'
import { refundCredits } from '../utils/credits.js'

// Refund the workspace ONLY on terminal failure (all BullMQ attempts exhausted),
// so auto-retries never double-refund or refund a job that later succeeds.
// Uses precise bucket refund when debitMonthly/debitPurchased are recorded on the Job;
// falls back to refunding the full amount to 'purchased' (safe — never inflates the monthly
// allowance that resets periodically) when the breakdown is unavailable.
export async function maybeRefundOnFailure(job) {
  if (!job?.data) return { refunded: false }
  const attempts = job.opts?.attempts ?? 1
  if ((job.attemptsMade ?? 0) < attempts) return { refunded: false } // retries still pending
  const { workspaceId, type, tier, jobId } = job.data
  try {
    const amount = creditCost(type, tier)
    // Look up bucket breakdown persisted on the Job document (if available)
    const jobDoc = jobId ? await Job.findById(jobId).lean() : null
    if (jobDoc && jobDoc.debitMonthly != null && jobDoc.debitPurchased != null) {
      // Precise refund: restore each bucket to exactly what was drawn
      const promises = []
      if (jobDoc.debitMonthly > 0)   promises.push(refundCredits(workspaceId, jobDoc.debitMonthly,   { jobId, type, tier, bucket: 'monthly' }))
      if (jobDoc.debitPurchased > 0) promises.push(refundCredits(workspaceId, jobDoc.debitPurchased, { jobId, type, tier, bucket: 'purchased' }))
      if (promises.length) await Promise.all(promises)
      else await refundCredits(workspaceId, amount, { jobId, type, tier, bucket: 'monthly' })
    } else {
      // Safe fallback: refund to 'purchased' bucket so the monthly allowance (which resets
      // each period) is never incorrectly inflated.
      await refundCredits(workspaceId, amount, { jobId, type, tier, bucket: 'purchased' })
    }
    return { refunded: true }
  } catch (e) { console.error('Credit refund on terminal failure failed:', e.message); return { refunded: false } }
}
