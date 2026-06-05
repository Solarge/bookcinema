import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import mongoose from 'mongoose'
import { config } from './config.js'
import { connectDB } from './db.js'

// ── Optional Sentry (no-op when SENTRY_DSN is unset or dep is missing) ───────
let Sentry = null
if (process.env.SENTRY_DSN) {
  try {
    Sentry = await import('@sentry/node')
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: config.nodeEnv })
    console.log('✓ Sentry initialized')
  } catch {
    console.warn('⚠ @sentry/node not installed — Sentry disabled')
    Sentry = null
  }
}

// Routes
import authRoutes      from './routes/auth.js'
import seriesRoutes    from './routes/series.js'
import assetRoutes     from './routes/assets.js'
import workspaceRoutes from './routes/workspaces.js'
import userRoutes      from './routes/users.js'
import shareRoutes     from './routes/share.js'
import analyticsRoutes from './routes/analytics.js'
import adminRoutes     from './routes/admin.js'
import generateRoutes  from './routes/generate.js'
import jobsRoutes      from './routes/jobs.js'
import { billingRouter, webhookHandler } from './routes/billing.js'
import { socialRouter } from './routes/social.js'

const app = express()

// Trust the first proxy hop so express-rate-limit keys on the real client IP
// (required when running behind a load-balancer, Vercel edge, or Nginx proxy).
app.set('trust proxy', 1)

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
// Build the allowed-origins list: always include clientUrl; add adminUrl when configured.
const _allowedOrigins = [config.clientUrl]
if (config.adminUrl) _allowedOrigins.push(config.adminUrl)

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, Postman in dev) and
    // any origin that is in the explicit allowed list.
    if (!origin || _allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
}))

// ── Request logging ───────────────────────────────────────────────────────────
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))

// Webhook must receive RAW body for Stripe signature verification — register BEFORE express.json()
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes)
app.use('/api/series',    seriesRoutes)
app.use('/api/assets',    assetRoutes)
app.use('/api/workspaces', workspaceRoutes)
app.use('/api/users',     userRoutes)
app.use('/api/share',     shareRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/admin',     adminRoutes)
app.use('/api/generate', generateRoutes)
app.use('/api/jobs',     jobsRoutes)
app.use('/api/billing', billingRouter)
app.use('/api/social',  socialRouter)

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1

  // Redis ping — best-effort with a short timeout; null when Redis is not configured.
  let redisOk = null
  try {
    const { getRedis } = await import('./utils/redis.js')
    // Race the client lookup+ping against a 500 ms timeout so health stays fast.
    const pingWithTimeout = Promise.race([
      (async () => {
        const redisClient = await getRedis()
        if (!redisClient) return null   // Redis not configured
        await redisClient.ping()
        return true
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
    ])
    redisOk = await pingWithTimeout  // null = not configured, true = ok
  } catch {
    redisOk = false
  }

  const status = mongoOk ? 'ok' : 'degraded'
  res.status(mongoOk ? 200 : 503).json({ status, mongo: mongoOk, redis: redisOk, ts: new Date().toISOString() })
})

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }))

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err)
  if (Sentry) Sentry.captureException(err)
  const status = err.status || err.statusCode || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
})

// ── Process-level safety nets ─────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
  if (Sentry) Sentry.captureException(reason)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  if (Sentry) Sentry.captureException(err)
  // Allow Sentry to flush before exiting
  process.exit(1)
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`)
  httpServer.close(async () => {
    try { await mongoose.disconnect() } catch {}
    console.log('✓ Server shut down cleanly')
    process.exit(0)
  })
  // Force-exit after 15 s if connections don't drain
  setTimeout(() => { console.error('Forced exit after timeout'); process.exit(1) }, 15000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

// ── Start ─────────────────────────────────────────────────────────────────────
await connectDB()
const httpServer = app.listen(config.port, () => {
  console.log(`✓ BookFilm Server running on port ${config.port} [${config.nodeEnv}]`)
})
