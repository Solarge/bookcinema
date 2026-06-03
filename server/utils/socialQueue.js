/**
 * Social publish queue — BullMQ Queue for delayed posting jobs.
 *
 * Mirrors generationQueue.js exactly:
 *  - Redis-optional: returns null when REDIS_URL is blank (tests don't need Redis).
 *  - Lazy init: the Queue object is created once on first use.
 *  - The route uses req.app.locals.socialPublishQueue || getSocialPublishQueue()
 *    so tests can inject a fake without ever touching Redis.
 */
import { Queue } from 'bullmq'
import { config } from '../config.js'

export const SOCIAL_PUBLISH_QUEUE = 'social-publish'

let _queue = null

/**
 * Lazily create and return the BullMQ Queue.
 * Returns null when REDIS_URL is not configured (hermetic for tests).
 */
export function getSocialPublishQueue() {
  if (_queue) return _queue
  if (!config.redis.url) return null
  let url
  try {
    url = new URL(config.redis.url)
  } catch {
    console.warn('Invalid REDIS_URL — social publish queue disabled')
    return null
  }
  _queue = new Queue(SOCIAL_PUBLISH_QUEUE, {
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
