import { config } from '../config.js'
import { connectDB } from '../db.js'
import { Worker } from 'bullmq'
import { GENERATION_QUEUE } from '../queue/generationQueue.js'
import { processGeneration } from './processGeneration.js'

if (!config.redis.url) { console.error('Worker requires REDIS_URL'); process.exit(1) }

const url = new URL(config.redis.url)
const connection = {
  host: url.hostname, port: Number(url.port) || 6379,
  password: url.password || undefined,
  tls: config.redis.url.startsWith('rediss://') ? {} : undefined,
  maxRetriesPerRequest: null,
}

await connectDB()
const worker = new Worker(GENERATION_QUEUE, async (job) => processGeneration(job.data), { connection, concurrency: config.managed.maxConcurrent })
worker.on('completed', (j) => console.log('✓ job done', j.id))
worker.on('failed', (j, err) => console.warn('✗ job failed', j?.id, err?.message))
console.log('✓ Generation worker listening on queue:', GENERATION_QUEUE)
