import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { config } from './config.js'
import { connectDB } from './db.js'

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

const app = express()

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
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

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }))

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err)
  const status = err.status || err.statusCode || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
})

// ── Start ─────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(config.port, () => {
    console.log(`✓ BookFilm Server running on port ${config.port} [${config.nodeEnv}]`)
  })
})
