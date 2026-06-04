import mongoose from 'mongoose'
import { config } from '../config.js'
import { connectDB } from '../db.js'
import { Worker } from 'bullmq'
import { GENERATION_QUEUE } from '../queue/generationQueue.js'
import { processGeneration } from './processGeneration.js'
import { maybeRefundOnFailure } from './refundOnFailure.js'
import { SOCIAL_PUBLISH_QUEUE } from '../utils/socialQueue.js'
import { processSocialPublish } from './processSocialPublish.js'
import { getProvider } from '../social/index.js'

// ── Optional Sentry (no-op when SENTRY_DSN is unset or dep is missing) ───────
let Sentry = null
if (process.env.SENTRY_DSN) {
  try {
    Sentry = await import('@sentry/node')
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: config.nodeEnv })
    console.log('✓ Sentry initialized (worker)')
  } catch {
    console.warn('⚠ @sentry/node not installed — Sentry disabled')
    Sentry = null
  }
}

if (!config.redis.url) { console.error('Worker requires REDIS_URL'); process.exit(1) }

const url = new URL(config.redis.url)
const connection = {
  host: url.hostname, port: Number(url.port) || 6379,
  password: url.password || undefined,
  tls: config.redis.url.startsWith('rediss://') ? {} : undefined,
  maxRetriesPerRequest: null,
}

await connectDB()

// Generation worker — lockDuration is generous (600s) to accommodate slow video polls
// (fal.ai kling / Replicate minimax can take up to ~8 minutes for a clip).
const worker = new Worker(GENERATION_QUEUE, async (job) => processGeneration(job.data), {
  connection,
  concurrency: config.managed.maxConcurrent,
  lockDuration: 600000,
  stalledInterval: 30000,
  maxStalledCount: 2,
})
worker.on('completed', (j) => console.log('✓ job done', j.id))
worker.on('failed', async (job, err) => {
  console.warn('✗ job failed', job?.id, err?.message)
  if (Sentry) Sentry.captureException(err, { extra: { jobId: job?.id } })
  await maybeRefundOnFailure(job)
})
console.log('✓ Generation worker listening on queue:', GENERATION_QUEUE)

// Social publish worker — generous lockDuration for video uploads
const socialWorker = new Worker(
  SOCIAL_PUBLISH_QUEUE,
  async (job) => processSocialPublish(job.data.postId, { getProvider }),
  {
    connection,
    concurrency: 2,
    lockDuration: 300000,
    stalledInterval: 30000,
    maxStalledCount: 2,
  },
)
socialWorker.on('completed', (j) => console.log('✓ social publish done', j.id))
socialWorker.on('failed', (job, err) => {
  console.warn('✗ social publish failed', job?.id, err?.message)
  if (Sentry) Sentry.captureException(err, { extra: { jobId: job?.id } })
})
console.log('✓ Social publish worker listening on queue:', SOCIAL_PUBLISH_QUEUE)

// ── Process-level safety nets ─────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('Worker unhandled rejection:', reason)
  if (Sentry) Sentry.captureException(reason)
})

process.on('uncaughtException', (err) => {
  console.error('Worker uncaught exception:', err)
  if (Sentry) Sentry.captureException(err)
  process.exit(1)
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`${signal} received — shutting down workers`)
  try {
    await Promise.all([worker.close(), socialWorker.close()])
    console.log('✓ Workers closed')
  } catch (err) {
    console.error('Error closing workers:', err)
  }
  try { await mongoose.disconnect() } catch {}
  console.log('✓ Worker process shut down cleanly')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
