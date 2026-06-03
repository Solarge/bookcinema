import { creditCost } from '../generation/creditCost.js'
import { refundCredits } from '../utils/credits.js'

// Refund the workspace ONLY on terminal failure (all BullMQ attempts exhausted),
// so auto-retries never double-refund or refund a job that later succeeds.
export async function maybeRefundOnFailure(job) {
  if (!job?.data) return { refunded: false }
  const attempts = job.opts?.attempts ?? 1
  if ((job.attemptsMade ?? 0) < attempts) return { refunded: false } // retries still pending
  const { workspaceId, type, tier, jobId } = job.data
  try {
    await refundCredits(workspaceId, creditCost(type, tier), { jobId, type, tier })
    return { refunded: true }
  } catch (e) { console.error('Credit refund on terminal failure failed:', e.message); return { refunded: false } }
}
