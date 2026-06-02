// Redis client — works with both Upstash (rediss://) and local Redis (redis://)
// Gracefully skips if REDIS_URL is not set (app works without Redis)
import { createClient } from 'redis'
import { config } from '../config.js'

let client = null
let connected = false

export async function getRedis() {
  if (!config.redis.url) return null   // Redis not configured — skip silently
  if (connected && client) return client

  client = createClient({
    url: config.redis.url,
    socket: {
      tls: config.redis.url.startsWith('rediss://'),  // Upstash requires TLS
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    },
  })

  client.on('error', err => console.warn('Redis error (non-fatal):', err.message))
  client.on('connect', () => { connected = true; console.log('✓ Redis connected') })
  client.on('end', () => { connected = false })

  await client.connect()
  return client
}

// Safe wrappers — never throw, return null on failure
export async function cacheSet(key, value, ttlSeconds = 3600) {
  try {
    const r = await getRedis()
    if (!r) return
    await r.set(key, JSON.stringify(value), { EX: ttlSeconds })
  } catch (_) {}
}

export async function cacheGet(key) {
  try {
    const r = await getRedis()
    if (!r) return null
    const val = await r.get(key)
    return val ? JSON.parse(val) : null
  } catch (_) { return null }
}

export async function cacheDel(key) {
  try {
    const r = await getRedis()
    if (!r) return
    await r.del(key)
  } catch (_) {}
}

// Cache a refresh token blacklist entry (for logout)
export async function blacklistToken(jti, ttlSeconds) {
  return cacheSet(`blacklist:${jti}`, 1, ttlSeconds)
}

export async function isTokenBlacklisted(jti) {
  const val = await cacheGet(`blacklist:${jti}`)
  return val !== null
}
