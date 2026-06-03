# 1C + 1D — Managed Generation Worker + API (text) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete the end-to-end managed **text** generation loop: client → `POST /api/generate/text` (guarded by allowlist + caps + kill-switch) → a `Job` row + a BullMQ enqueue → a **worker** that runs the resolved adapter, stores the result on the Job, and logs usage → client polls `GET /api/jobs/:id`.

**Architecture:** New `Job` Mongoose model (workspace-scoped). `managedAccess` middleware enforces `workspace.managedBeta` + a **Mongo-counted** daily cap + in-flight concurrency + a global kill-switch (all testable without Redis). The generate route creates the Job and enqueues via the 1B queue, with the queue **injectable through `req.app.locals.generationQueue`** so route tests need no Redis. The worker (`server/worker/index.js`) is a separate process consuming the `generation` queue; its core `processGeneration` is a pure-ish unit (mock adapter + in-memory Mongo).

**Tech Stack:** Express, Mongoose, BullMQ (1B), `node:test` + `mongodb-memory-server` + `supertest`. Builds on 1B (`server/generation/`, `server/queue/generationQueue.js`, `config.providerKeys`).

**Infra:** Build + all unit/route tests need NO infra (queue injected, quotas Mongo-counted). Live end-to-end needs a working `REDIS_URL` (single `@`!) + `GROQ_API_KEY` (already set/verified).

**Scope boundary:** TEXT only. Image/voice adapters + their result-to-S3 handling = later **1B-media**. Client managed-mode UI (mode toggle, polling) = later **1E**. This plan delivers the server loop + is unit/route-tested; live verification of the queue→worker hop is done once Redis is fixed.

---

## File Structure

**Create:**
- `server/models/Job.js` — managed-generation job record.
- `server/middleware/managedAccess.js` — allowlist + daily cap + concurrency + kill-switch.
- `server/routes/generate.js` — `POST /api/generate/text`.
- `server/routes/jobs.js` — `GET /api/jobs/:id`, `GET /api/jobs`.
- `server/worker/processGeneration.js` — core job processor (testable).
- `server/worker/index.js` — BullMQ Worker entrypoint (process).
- Tests: `server/test/job-model.test.js`, `managed-access.test.js`, `generate-routes.test.js`, `jobs-routes.test.js`, `process-generation.test.js`.

**Modify:**
- `server/config.js` — `config.managed` (enabled flag, caps, max concurrent).
- `server/index.js` — mount `/api/generate` + `/api/jobs`.
- `server/.env.server.example` — document MANAGED_* vars.
- `server/package.json` — add `worker` start script.

---

## Task 1: config.managed

**Files:** Modify `server/config.js`; Test `server/test/config-managed.test.js`

- [ ] **Step 1: failing test** — Create `server/test/config-managed.test.js`:
```js
import './helpers/env.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../config.js'

test('config.managed has sane defaults when env unset', () => {
  assert.equal(typeof config.managed.enabled, 'boolean')
  assert.equal(config.managed.caps.text > 0, true)
  assert.equal(config.managed.maxConcurrent > 0, true)
})
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3:** In `server/config.js` add inside the config object:
```js
  managed: {
    enabled:       process.env.MANAGED_GENERATION_ENABLED !== 'false', // default ON
    maxConcurrent: Number(process.env.MANAGED_MAX_CONCURRENT) || 3,
    caps: {
      text:  Number(process.env.MANAGED_CAP_TEXT_DAILY)  || 20,
      image: Number(process.env.MANAGED_CAP_IMAGE_DAILY) || 50,
      voice: Number(process.env.MANAGED_CAP_VOICE_DAILY) || 100,
    },
  },
```
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5:** Append to `server/.env.server.example`:
```
# ── Managed generation guardrails (1C/1D) ───────────────────────
MANAGED_GENERATION_ENABLED=true
MANAGED_MAX_CONCURRENT=3
MANAGED_CAP_TEXT_DAILY=20
MANAGED_CAP_IMAGE_DAILY=50
MANAGED_CAP_VOICE_DAILY=100
```
- [ ] **Step 6: commit** `feat: add config.managed (kill-switch, caps, concurrency)`

---

## Task 2: Job model

**Files:** Create `server/models/Job.js`; Test `server/test/job-model.test.js`

- [ ] **Step 1: failing test** — Create `server/test/job-model.test.js`:
```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Job from '../models/Job.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

test('Job requires workspaceId + type + tier and defaults status to queued', async () => {
  const j = await Job.create({ workspaceId: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId(), type: 'text', tier: 'standard' })
  assert.equal(j.status, 'queued')
  assert.equal(j.type, 'text')
})

test('Job rejects an invalid status', async () => {
  await assert.rejects(() => Job.create({ workspaceId: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId(), type: 'text', tier: 'standard', status: 'banana' }))
})
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3:** Create `server/models/Job.js`:
```js
import mongoose from 'mongoose'

const jobSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:        { type: String, enum: ['text', 'image', 'voice'], required: true },
  tier:        { type: String, enum: ['standard', 'premium'], default: 'standard' },
  status:      { type: String, enum: ['queued', 'active', 'done', 'failed'], default: 'queued', index: true },

  // sanitized request params (never store secrets)
  params:      { type: mongoose.Schema.Types.Mixed, default: {} },

  // result: text for text jobs, url for media jobs
  resultText:  { type: String, default: null },
  resultUrl:   { type: String, default: null },

  costUsd:      { type: Number, default: 0 },
  errorMessage: { type: String, default: null },
  bullJobId:    { type: String, default: null },
}, { timestamps: true })

jobSchema.index({ workspaceId: 1, createdAt: -1 })

export default mongoose.model('Job', jobSchema)
```
- [ ] **Step 4: run → PASS.** **Step 5: commit** `feat: add Job model for managed generation`

---

## Task 3: managedAccess middleware

**Files:** Create `server/middleware/managedAccess.js`; Test `server/test/managed-access.test.js`

Runs AFTER `requireAuth` + `resolveWorkspace`. Order of checks: kill-switch (503) → allowlist (403) → concurrency (429) → daily cap (429). Cap + concurrency are Mongo counts on `Job` (no Redis).

- [ ] **Step 1: failing test** — Create `server/test/managed-access.test.js`:
```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Job from '../models/Job.js'
import { managedAccess } from '../middleware/managedAccess.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

function mockRes() { return { statusCode: 200, body: null, status(c){this.statusCode=c;return this}, json(b){this.body=b;return this} } }
function reqFor(managedBeta, wsId) { return { workspace: { _id: wsId, managedBeta }, user: { _id: new mongoose.Types.ObjectId() }, body: { type: 'text' }, params: {} } }

test('403 when workspace not on managed allowlist', async () => {
  const req = reqFor(false, new mongoose.Types.ObjectId()); const res = mockRes(); let n = false
  await managedAccess('text')(req, res, () => { n = true })
  assert.equal(res.statusCode, 403); assert.equal(n, false)
})

test('passes for an allowlisted workspace under cap', async () => {
  const req = reqFor(true, new mongoose.Types.ObjectId()); const res = mockRes(); let n = false
  await managedAccess('text')(req, res, () => { n = true })
  assert.equal(n, true)
})

test('429 when the daily text cap is reached', async () => {
  const wsId = new mongoose.Types.ObjectId()
  process.env.MANAGED_CAP_TEXT_DAILY = '1' // note: config snapshot may differ; see impl note
  // create 1 done job today to hit cap of 1
  await Job.create({ workspaceId: wsId, createdBy: new mongoose.Types.ObjectId(), type: 'text', tier: 'standard', status: 'done' })
  const req = reqFor(true, wsId); const res = mockRes()
  await managedAccess('text', { capOverride: 1 })(req, res, () => {})
  assert.equal(res.statusCode, 429)
})

test('503 when kill-switch is off', async () => {
  const req = reqFor(true, new mongoose.Types.ObjectId()); const res = mockRes()
  await managedAccess('text', { enabledOverride: false })(req, res, () => {})
  assert.equal(res.statusCode, 503)
})
```
> Impl note: `managedAccess(type, overrides)` accepts optional `{ enabledOverride, capOverride, maxConcurrentOverride }` so tests don't fight the config snapshot. Production calls `managedAccess('text')` and reads `config.managed`.

- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3:** Create `server/middleware/managedAccess.js`:
```js
import Job from '../models/Job.js'
import { config } from '../config.js'

function startOfUtcDay() { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d }

export function managedAccess(type, overrides = {}) {
  return async (req, res, next) => {
    try {
      const enabled = overrides.enabledOverride ?? config.managed.enabled
      if (!enabled) return res.status(503).json({ error: 'Managed generation is temporarily disabled' })

      if (!req.workspace?.managedBeta) return res.status(403).json({ error: 'Managed generation is not enabled for this workspace' })

      const wsId = req.workspace._id
      const maxConcurrent = overrides.maxConcurrentOverride ?? config.managed.maxConcurrent
      const inflight = await Job.countDocuments({ workspaceId: wsId, status: { $in: ['queued', 'active'] } })
      if (inflight >= maxConcurrent) return res.status(429).json({ error: 'Too many in-flight generations; try again shortly' })

      const cap = overrides.capOverride ?? config.managed.caps[type]
      const todayCount = await Job.countDocuments({ workspaceId: wsId, type, createdAt: { $gte: startOfUtcDay() } })
      if (todayCount >= cap) return res.status(429).json({ error: `Daily ${type} generation limit reached` })

      next()
    } catch (err) {
      console.error('managedAccess error:', err)
      return res.status(500).json({ error: 'Server error' })
    }
  }
}
```
- [ ] **Step 4: run → PASS.** **Step 5: commit** `feat: managedAccess guardrails (allowlist, caps, concurrency, kill-switch)`

---

## Task 4: generate route (POST /api/generate/text)

**Files:** Create `server/routes/generate.js`; Test `server/test/generate-routes.test.js`

The route creates a `Job(queued)` then enqueues via the 1B queue, injectable through `req.app.locals.generationQueue` for tests.

- [ ] **Step 1: failing test** — Create `server/test/generate-routes.test.js`:
```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import generateRoutes from '../routes/generate.js'
import Job from '../models/Job.js'
import Workspace from '../models/Workspace.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

function app(fakeQueue) {
  const a = express(); a.use(express.json())
  if (fakeQueue) a.locals.generationQueue = fakeQueue
  a.use('/api/generate', generateRoutes); return a
}
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())

async function betaUser() {
  const { user, token, workspace } = await makeAuthedUser()
  await Workspace.findByIdAndUpdate(workspace._id, { managedBeta: true })
  return { user, token, workspace }
}

test('POST /text creates a queued job and enqueues it (202)', async () => {
  const { token, workspace } = await betaUser()
  const enq = []
  const fakeQueue = { add: async (n, d) => { enq.push({ n, d }); return { id: 'bull1' } } }
  const res = await authed(request(app(fakeQueue)).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'a fable', genrePreset: 'cinematic', language: 'en', tier: 'standard' })
  assert.equal(res.status, 202)
  assert.ok(res.body.jobId)
  const job = await Job.findById(res.body.jobId)
  assert.equal(job.status, 'queued')
  assert.equal(job.type, 'text')
  assert.equal(enq.length, 1)
})

test('POST /text 403 when workspace not allowlisted', async () => {
  const { user, token, workspace } = await makeAuthedUser() // managedBeta false
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/text'), token, workspace._id)
    .send({ bookText: 'x', tier: 'standard' })
  assert.equal(res.status, 403)
})

test('POST /text 400 on missing bookText', async () => {
  const { token, workspace } = await betaUser()
  const res = await authed(request(app({ add: async () => ({}) })).post('/api/generate/text'), token, workspace._id)
    .send({ tier: 'standard' })
  assert.equal(res.status, 400)
})
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3:** Create `server/routes/generate.js`:
```js
import { Router } from 'express'
import Job from '../models/Job.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { managedAccess } from '../middleware/managedAccess.js'
import { addGenerationJob } from '../queue/generationQueue.js'

const router = Router()
router.use(requireAuth, resolveWorkspace)

// POST /api/generate/text
router.post('/text', managedAccess('text'), async (req, res) => {
  try {
    const { bookText, genrePreset = 'cinematic', language = 'en', tier = 'standard' } = req.body
    if (!bookText) return res.status(400).json({ error: 'bookText is required' })
    if (!['standard', 'premium'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' })

    const job = await Job.create({
      workspaceId: req.workspace._id,
      createdBy: req.user._id,
      type: 'text', tier, status: 'queued',
      params: { genrePreset, language }, // NOTE: bookText passed to the queue, not persisted in full
    })

    try {
      const queue = req.app.locals.generationQueue // tests inject; prod falls back inside addGenerationJob
      const bull = await addGenerationJob({ type: 'text', tier, payload: { bookText, genrePreset, language }, workspaceId: String(req.workspace._id), createdBy: String(req.user._id), jobId: String(job._id) }, queue)
      job.bullJobId = bull?.id ? String(bull.id) : null
      await job.save()
    } catch (qErr) {
      job.status = 'failed'; job.errorMessage = 'Could not enqueue (queue unavailable)'
      await job.save()
      return res.status(503).json({ error: 'Generation queue unavailable', jobId: String(job._id) })
    }

    res.status(202).json({ jobId: String(job._id) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
```
> Note: `addGenerationJob` payload gains `jobId` so the worker can find the Mongo Job. Update its destructure in Task 6 wiring if needed (it already passes through arbitrary fields in `data`).
- [ ] **Step 4: run → PASS.** **Step 5: commit** `feat: POST /api/generate/text (job + enqueue, guarded)`

---

## Task 5: jobs route (GET /api/jobs/:id, GET /api/jobs)

**Files:** Create `server/routes/jobs.js`; Test `server/test/jobs-routes.test.js`

- [ ] **Step 1: failing test** — Create `server/test/jobs-routes.test.js`:
```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import jobsRoutes from '../routes/jobs.js'
import Job from '../models/Job.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
function app() { const a = express(); a.use(express.json()); a.use('/api/jobs', jobsRoutes); return a }
const authed = (r, t, w) => r.set('Authorization', `Bearer ${t}`).set('X-Workspace-Id', w.toString())

test('GET /:id returns a job in the active workspace', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  const job = await Job.create({ workspaceId: workspace._id, createdBy: user._id, type: 'text', tier: 'standard', status: 'done', resultText: '{"title":"X"}' })
  const res = await authed(request(app()).get(`/api/jobs/${job._id}`), token, workspace._id)
  assert.equal(res.status, 200)
  assert.equal(res.body.status, 'done')
  assert.equal(res.body.result.text, '{"title":"X"}')
})

test('GET /:id 404 for a job in another workspace', async () => {
  const { token, workspace } = await makeAuthedUser()
  const foreign = await Job.create({ workspaceId: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId(), type: 'text', tier: 'standard' })
  const res = await authed(request(app()).get(`/api/jobs/${foreign._id}`), token, workspace._id)
  assert.equal(res.status, 404)
})
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3:** Create `server/routes/jobs.js`:
```js
import { Router } from 'express'
import Job from '../models/Job.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'

const router = Router()
router.use(requireAuth, resolveWorkspace)

function view(job) {
  return {
    id: String(job._id), type: job.type, tier: job.tier, status: job.status,
    result: job.type === 'text' ? { text: job.resultText } : { url: job.resultUrl },
    error: job.errorMessage, costUsd: job.costUsd, createdAt: job.createdAt,
  }
}

// GET /api/jobs?limit=
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const jobs = await Job.find({ workspaceId: req.workspace._id }).sort({ createdAt: -1 }).limit(limit)
    res.json(jobs.map(view))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/jobs/:id
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!job) return res.status(404).json({ error: 'Job not found' })
    res.json(view(job))
  } catch (err) { res.status(404).json({ error: 'Job not found' }) }
})

export default router
```
- [ ] **Step 4: run → PASS.** **Step 5: commit** `feat: GET /api/jobs/:id + list (workspace-scoped)`

---

## Task 6: worker processor + entrypoint

**Files:** Create `server/worker/processGeneration.js`, `server/worker/index.js`; Modify `server/package.json`; Test `server/test/process-generation.test.js`

- [ ] **Step 1: failing test** — Create `server/test/process-generation.test.js`:
```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { processGeneration } from '../worker/processGeneration.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)

test('processGeneration runs the adapter, stores result, logs usage, marks done', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'text', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ provider: 'groq', adapter: { generate: async () => ({ title: 'Done', characters: [], episodes: [] }) } })
  await processGeneration({ jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve })
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'done')
  assert.match(updated.resultText, /"title":"Done"/)
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, action: 'generate_text', success: true }), 1)
})

test('processGeneration marks the job failed + logs on adapter error', async () => {
  const wsId = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId()
  const job = await Job.create({ workspaceId: wsId, createdBy: uid, type: 'text', tier: 'standard', status: 'queued' })
  const fakeResolve = () => ({ provider: 'groq', adapter: { generate: async () => { throw new Error('boom') } } })
  await assert.rejects(() => processGeneration({ jobId: String(job._id), type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: String(wsId), createdBy: String(uid) }, { resolveFn: fakeResolve }))
  const updated = await Job.findById(job._id)
  assert.equal(updated.status, 'failed')
  assert.match(updated.errorMessage, /boom/)
  assert.equal(await UsageLog.countDocuments({ workspaceId: wsId, success: false }), 1)
})
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3:** Create `server/worker/processGeneration.js`:
```js
import Job from '../models/Job.js'
import UsageLog from '../models/UsageLog.js'
import { resolve as defaultResolve } from '../generation/resolve.js'

// Core job processor. `deps.resolveFn` is injectable for tests.
export async function processGeneration(data, deps = {}) {
  const resolveFn = deps.resolveFn || defaultResolve
  const { jobId, type, tier, payload, workspaceId, createdBy } = data
  const { provider, adapter } = resolveFn(type, tier)

  await Job.findByIdAndUpdate(jobId, { status: 'active' })
  try {
    const result = await adapter.generate(payload)
    const resultText = typeof result === 'string' ? result : JSON.stringify(result)
    await Job.findByIdAndUpdate(jobId, { status: 'done', resultText, errorMessage: null })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'generate_text', provider, success: true })
    return { ok: true }
  } catch (err) {
    const msg = (err?.message || 'generation failed').slice(0, 500) // sanitized, bounded
    await Job.findByIdAndUpdate(jobId, { status: 'failed', errorMessage: msg })
    await UsageLog.create({ userId: createdBy, workspaceId, action: 'generate_text', provider, success: false, errorMessage: msg })
    throw err // rethrow so BullMQ records the attempt / triggers retry
  }
}
```
- [ ] **Step 4:** Create `server/worker/index.js` (entrypoint — imports config FIRST to load env + connect DB):
```js
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
const worker = new Worker(GENERATION_QUEUE, async (job) => processGeneration(job.data), { connection, concurrency: 2 })
worker.on('completed', (j) => console.log('✓ job done', j.id))
worker.on('failed', (j, err) => console.warn('✗ job failed', j?.id, err?.message))
console.log('✓ Generation worker listening on queue:', GENERATION_QUEUE)
```
- [ ] **Step 5:** In `server/package.json` scripts add: `"worker": "node worker/index.js"`.
- [ ] **Step 6: run test → PASS;** full suite → green. **Commit** `feat: managed generation worker + processor`

---

## Task 7: wire routes in server entry

**Files:** Modify `server/index.js`

- [ ] **Step 1:** In `server/index.js` add imports + mounts:
```js
import generateRoutes from './routes/generate.js'
import jobsRoutes     from './routes/jobs.js'
// ...
app.use('/api/generate', generateRoutes)
app.use('/api/jobs',     jobsRoutes)
```
- [ ] **Step 2:** Run `cd server && npm test` → green; start server locally (`npm start`) only if infra present — otherwise skip. **Commit** `feat: mount /api/generate + /api/jobs`

---

## Task 8: Full verification + (optional) live loop

- [ ] **Step 1:** `cd server && npm test` → all pass (existing 62 + new ~14).
- [ ] **Step 2 (needs infra): live loop.** With a VALID `REDIS_URL` (single `@`) + Redis running + `GROQ_API_KEY`: start `npm run worker` and `npm start`; allowlist a workspace (`Workspace.managedBeta=true`); `POST /api/generate/text`; poll `GET /api/jobs/:id` until `done` and confirm `result.text` is a valid series JSON.
- [ ] **Step 3:** push.

---

## Self-Review (planning)

**Spec coverage (1C/1D text portions):** Job model ✓ (T2), managedAccess allowlist+caps+concurrency+kill-switch ✓ (T3), POST /api/generate/text ✓ (T4), GET /api/jobs(/:id) workspace-scoped ✓ (T5), worker processor + entry ✓ (T6), wiring ✓ (T7). Quotas are Mongo-counted (testable w/o Redis); queue injected via app.locals for hermetic route tests.

**Deferred:** image/voice generate endpoints + S3 result handling (1B-media), client managed-mode + polling UI (1E), Redis-backed quota (Mongo-count is sufficient and simpler now).

**Boot/infra:** all tests pass with no infra (no Redis, providers mocked/not called — generate route only enqueues to an injected fake queue; worker processor uses injected resolveFn). Live loop needs the REDIS_URL `@@`→`@` fix + Redis + Groq key.

**Placeholder scan:** none — every step has concrete code.
