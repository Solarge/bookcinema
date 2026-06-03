import { Queue } from 'bullmq'
import { config } from '../config.js'

export const GENERATION_QUEUE = 'generation'

let _queue = null
// Lazily create the real queue only when Redis is configured. Returns null otherwise.
export function getGenerationQueue() {
  if (_queue) return _queue
  if (!config.redis.url) return null
  let url
  try {
    url = new URL(config.redis.url)
  } catch {
    console.warn('Invalid REDIS_URL — generation queue disabled')
    return null
  }
  _queue = new Queue(GENERATION_QUEUE, {
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      tls: config.redis.url.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: null,
    },
  })
  return _queue
}

// queueOverride lets tests inject a fake queue (no Redis needed).
export async function addGenerationJob({ jobId, type, tier, payload, workspaceId, createdBy }, queueOverride) {
  const queue = queueOverride || getGenerationQueue()
  if (!queue) throw new Error('Generation queue unavailable (REDIS_URL not set)')
  return queue.add('generate', { jobId, type, tier, payload, workspaceId, createdBy }, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  })
}
