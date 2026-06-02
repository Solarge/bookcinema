# 1A — Workspace Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make **Workspace** the tenant of the application — every user gets a personal workspace, every request resolves an active workspace, and `Series`/`Asset` are scoped by `workspaceId` — replacing the existing `Team` model, with a backfill migration that preserves all existing data.

**Architecture:** Promote `Team` → `Workspace` (adds `type: personal|organization` and `managedBeta`). On registration a personal workspace is auto-created; a `resolveWorkspace` middleware resolves the active workspace per request from an `X-Workspace-Id` header (default = user's personal workspace) and verifies membership. `Series` and `Asset` queries switch from `userId`/`teamId` filters to `workspaceId`. A one-shot idempotent script backfills personal workspaces, converts existing Teams to organization workspaces, and stamps existing rows with `workspaceId`.

**Tech Stack:** Node 20 ESM, Express 4, Mongoose 8, JWT (jsonwebtoken). Tests: built-in `node:test` runner + `mongodb-memory-server` + `supertest` (new devDependencies). Frontend: React 19 (AuthContext, `src/lib/api.js`).

**Scope boundary:** This plan establishes tenancy only. It does NOT add generation, queues, billing, credits, or plan enforcement (later phase-plans 1B–1E and sub-projects #2–#6). The app must behave exactly as before from the user's perspective, just workspace-scoped under the hood.

---

## File Structure

**Create:**
- `server/models/Workspace.js` — the tenant model (replaces `Team`).
- `server/utils/workspace.js` — `createPersonalWorkspace(user)` helper (shared by registration + migration).
- `server/middleware/workspace.js` — `resolveWorkspace`, `requireWorkspaceRole`.
- `server/routes/workspaces.js` — workspace CRUD + membership + `/switch` (replaces `routes/teams.js`).
- `server/scripts/backfill-workspaces.js` — one-shot idempotent migration.
- `server/test/helpers/db.js` — in-memory Mongo test harness.
- `server/test/*.test.js` — unit + integration tests.

**Modify:**
- `server/models/User.js` — drop `teamId`, add `defaultWorkspaceId`.
- `server/models/Series.js` — drop `teamId`, add `workspaceId` (indexed).
- `server/models/Asset.js` — drop `teamId`, add `workspaceId` (indexed).
- `server/utils/jwt.js` — drop `teamId` from `decodePayload`.
- `server/routes/auth.js` — create personal workspace on register; drop `teamId` from tokens; return `defaultWorkspaceId`.
- `server/routes/series.js` — scope by `workspaceId` via `resolveWorkspace`.
- `server/routes/assets.js` — scope by `workspaceId` via `resolveWorkspace`.
- `server/routes/share.js` — `.select('-workspaceId')` instead of `-teamId`.
- `server/middleware/auth.js` — remove `requireTeamRole` (replaced by `requireWorkspaceRole`).
- `server/index.js` — mount `workspaces` route, remove `teams` route.
- `server/package.json` — add `test` script + devDependencies.
- `src/lib/api.js` — send `X-Workspace-Id`; add `workspaces` namespace; rename `teams`→`workspaces`.
- `src/contexts/AuthContext.jsx` — load workspaces + active workspace on boot.

**Delete:**
- `server/models/Team.js`, `server/routes/teams.js` (after migration code no longer imports them).

---

## Task 1: Test infrastructure

**Files:**
- Modify: `server/package.json`
- Create: `server/test/helpers/db.js`
- Create: `server/test/smoke.test.js`

- [ ] **Step 1: Add devDependencies and test script**

Modify `server/package.json` — add a `test` script and devDependencies:

```json
{
  "name": "bookfilm-server",
  "version": "1.0.0",
  "description": "BookFilm Studio API Server",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "node --test --test-concurrency=1 test/",
    "migrate:workspaces": "node scripts/backfill-workspaces.js"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/lib-storage": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.3.1",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.4.4",
    "multer": "^1.4.5-lts.1",
    "multer-s3": "^3.0.1",
    "nodemailer": "^6.9.14",
    "redis": "^6.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "mongodb-memory-server": "^10.1.2",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `cd server && npm install`
Expected: installs `mongodb-memory-server` + `supertest` without errors.

- [ ] **Step 3: Create the in-memory Mongo test harness**

Create `server/test/helpers/db.js`:

```js
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongod = null

export async function startTestDB() {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}

export async function stopTestDB() {
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
}

export async function clearTestDB() {
  const { collections } = mongoose.connection
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({})
  }
}
```

- [ ] **Step 4: Write a smoke test proving the harness works**

Create `server/test/smoke.test.js`:

```js
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB } from './helpers/db.js'

before(startTestDB)
after(stopTestDB)

test('in-memory mongo connects', () => {
  assert.equal(mongoose.connection.readyState, 1) // 1 = connected
})
```

- [ ] **Step 5: Run the smoke test**

Run: `cd server && npm test`
Expected: PASS — `in-memory mongo connects`. (First run downloads a MongoDB binary; may take a minute.)

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/test/
git commit -m "test: add node:test harness with in-memory mongo"
```

---

## Task 2: Workspace model

**Files:**
- Create: `server/models/Workspace.js`
- Test: `server/test/workspace-model.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/workspace-model.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Workspace from '../models/Workspace.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

const ownerId = () => new mongoose.Types.ObjectId()

test('creates a personal workspace with an owner member and slug', async () => {
  const uid = ownerId()
  const ws = await Workspace.create({
    name: 'Jane Doe', type: 'personal', ownerId: uid,
    members: [{ userId: uid, role: 'owner' }],
  })
  assert.equal(ws.type, 'personal')
  assert.equal(ws.plan, 'free')
  assert.equal(ws.managedBeta, false)
  assert.ok(ws.slug.length > 0)
  assert.equal(ws.getMemberRole(uid), 'owner')
  assert.equal(ws.hasMember(uid), true)
  assert.equal(ws.hasMember(ownerId()), false)
})

test('rejects an invalid member role', async () => {
  const uid = ownerId()
  await assert.rejects(() => Workspace.create({
    name: 'Bad', type: 'personal', ownerId: uid,
    members: [{ userId: uid, role: 'superuser' }],
  }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/workspace-model.test.js`
Expected: FAIL — `Cannot find module '../models/Workspace.js'`.

- [ ] **Step 3: Create the model**

Create `server/models/Workspace.js`:

```js
import mongoose from 'mongoose'

const memberSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role:     { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false })

const inviteSchema = new mongoose.Schema({
  email:     { type: String, required: true, lowercase: true },
  role:      { type: String, enum: ['admin', 'member'], default: 'member' },
  token:     { type: String, required: true },
  expiresAt: { type: Date, required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false })

const workspaceSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  slug:    { type: String, unique: true, lowercase: true },
  type:    { type: String, enum: ['personal', 'organization'], default: 'personal' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan:    { type: String, enum: ['free', 'pro', 'studio'], default: 'free' },

  // Managed-generation beta allowlist — gates which tenants may spend platform money
  managedBeta: { type: Boolean, default: false },

  members: [memberSchema],
  invites: [inviteSchema],
  settings: {
    whiteLabel:      { type: mongoose.Schema.Types.Mixed, default: {} },
    defaultLanguage: { type: String, default: 'en' },
  },

  // Idempotency marker for the Team→Workspace backfill
  migratedFromTeamId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
}, { timestamps: true })

// Auto-generate a unique-ish slug from name (random suffix avoids collisions for personal workspaces)
workspaceSchema.pre('save', function (next) {
  if (!this.slug) {
    const base = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
    this.slug = `${base}-${Math.random().toString(36).slice(2, 8)}`
  }
  next()
})

workspaceSchema.methods.hasMember = function (userId) {
  return this.members.some(m => m.userId.toString() === userId.toString())
}

workspaceSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find(m => m.userId.toString() === userId.toString())
  return member?.role ?? null
}

export default mongoose.model('Workspace', workspaceSchema)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/workspace-model.test.js`
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add server/models/Workspace.js server/test/workspace-model.test.js
git commit -m "feat: add Workspace tenant model"
```

---

## Task 3: User model — defaultWorkspaceId

**Files:**
- Modify: `server/models/User.js`
- Test: `server/test/user-model.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/user-model.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import User from '../models/User.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

test('user has defaultWorkspaceId field and no teamId', async () => {
  const u = await User.create({ name: 'A', email: 'a@x.com', password: 'password123' })
  assert.equal(u.defaultWorkspaceId, null)
  assert.equal(u.schema.path('teamId'), undefined) // teamId removed
  const wsId = new mongoose.Types.ObjectId()
  u.defaultWorkspaceId = wsId
  await u.save()
  assert.equal(u.defaultWorkspaceId.toString(), wsId.toString())
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/user-model.test.js`
Expected: FAIL — `defaultWorkspaceId` is `undefined` and `teamId` path still exists.

- [ ] **Step 3: Edit the model**

In `server/models/User.js`, replace the `teamId` line:

```js
  teamId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
```

with:

```js
  defaultWorkspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/user-model.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/models/User.js server/test/user-model.test.js
git commit -m "feat: replace User.teamId with defaultWorkspaceId"
```

---

## Task 4: Scope Series & Asset to workspaceId

**Files:**
- Modify: `server/models/Series.js`, `server/models/Asset.js`
- Test: `server/test/scoped-models.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/scoped-models.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import Series from '../models/Series.js'
import Asset from '../models/Asset.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

test('Series requires workspaceId and has no teamId path', async () => {
  assert.equal(Series.schema.path('teamId'), undefined)
  assert.ok(Series.schema.path('workspaceId'))
  const s = await Series.create({
    userId: new mongoose.Types.ObjectId(),
    workspaceId: new mongoose.Types.ObjectId(),
    title: 'T', fullOutput: { ok: true },
  })
  assert.ok(s.workspaceId)
})

test('Asset has workspaceId and no teamId path', async () => {
  assert.equal(Asset.schema.path('teamId'), undefined)
  assert.ok(Asset.schema.path('workspaceId'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/scoped-models.test.js`
Expected: FAIL — `workspaceId` path missing, `teamId` still present.

- [ ] **Step 3: Edit Series model**

In `server/models/Series.js`, replace the `teamId` line:

```js
  teamId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Team',  default: null, index: true },
```

with:

```js
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
```

- [ ] **Step 4: Edit Asset model**

In `server/models/Asset.js`, replace the `teamId` line:

```js
  teamId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Team',   default: null },
```

with:

```js
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && node --test test/scoped-models.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/models/Series.js server/models/Asset.js server/test/scoped-models.test.js
git commit -m "feat: scope Series and Asset by workspaceId"
```

---

## Task 5: createPersonalWorkspace helper

**Files:**
- Create: `server/utils/workspace.js`
- Test: `server/test/workspace-helper.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/workspace-helper.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import User from '../models/User.js'
import Workspace from '../models/Workspace.js'
import { createPersonalWorkspace } from '../utils/workspace.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

test('creates a personal workspace and sets the user default', async () => {
  const user = await User.create({ name: 'Jane', email: 'j@x.com', password: 'password123' })
  const ws = await createPersonalWorkspace(user)

  assert.equal(ws.type, 'personal')
  assert.equal(ws.ownerId.toString(), user._id.toString())
  assert.equal(ws.getMemberRole(user._id), 'owner')

  const reloaded = await User.findById(user._id)
  assert.equal(reloaded.defaultWorkspaceId.toString(), ws._id.toString())
})

test('is idempotent — returns existing personal workspace if one exists', async () => {
  const user = await User.create({ name: 'Jane', email: 'j2@x.com', password: 'password123' })
  const first = await createPersonalWorkspace(user)
  const second = await createPersonalWorkspace(await User.findById(user._id))
  assert.equal(first._id.toString(), second._id.toString())
  assert.equal(await Workspace.countDocuments({ ownerId: user._id, type: 'personal' }), 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/workspace-helper.test.js`
Expected: FAIL — `Cannot find module '../utils/workspace.js'`.

- [ ] **Step 3: Create the helper**

Create `server/utils/workspace.js`:

```js
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'

// Create (or return existing) personal workspace for a user, and set it as their default.
export async function createPersonalWorkspace(user) {
  const existing = await Workspace.findOne({ ownerId: user._id, type: 'personal' })
  if (existing) {
    if (!user.defaultWorkspaceId) {
      await User.findByIdAndUpdate(user._id, { defaultWorkspaceId: existing._id })
    }
    return existing
  }
  const ws = await Workspace.create({
    name: user.name || 'My Workspace',
    type: 'personal',
    ownerId: user._id,
    plan: 'free',
    members: [{ userId: user._id, role: 'owner' }],
  })
  await User.findByIdAndUpdate(user._id, { defaultWorkspaceId: ws._id })
  return ws
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/workspace-helper.test.js`
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add server/utils/workspace.js server/test/workspace-helper.test.js
git commit -m "feat: add createPersonalWorkspace helper"
```

---

## Task 6: resolveWorkspace + requireWorkspaceRole middleware

**Files:**
- Create: `server/middleware/workspace.js`
- Test: `server/test/workspace-middleware.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/workspace-middleware.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import User from '../models/User.js'
import Workspace from '../models/Workspace.js'
import { resolveWorkspace, requireWorkspaceRole } from '../middleware/workspace.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

async function seed(role = 'owner') {
  const user = await User.create({ name: 'A', email: `a${Math.random()}@x.com`, password: 'password123' })
  const ws = await Workspace.create({
    name: 'WS', type: 'personal', ownerId: user._id, members: [{ userId: user._id, role }],
  })
  user.defaultWorkspaceId = ws._id
  await user.save()
  return { user, ws }
}

test('resolveWorkspace attaches req.workspace using the default when no header', async () => {
  const { user, ws } = await seed()
  const req = { user, headers: {} }
  const res = mockRes()
  let nexted = false
  await resolveWorkspace(req, res, () => { nexted = true })
  assert.equal(nexted, true)
  assert.equal(req.workspace._id.toString(), ws._id.toString())
  assert.equal(req.membership.role, 'owner')
})

test('resolveWorkspace 403s when user is not a member of requested workspace', async () => {
  const { user } = await seed()
  const otherWs = await Workspace.create({
    name: 'Other', type: 'organization', ownerId: new mongoose.Types.ObjectId(),
    members: [{ userId: new mongoose.Types.ObjectId(), role: 'owner' }],
  })
  const req = { user, headers: { 'x-workspace-id': otherWs._id.toString() } }
  const res = mockRes()
  await resolveWorkspace(req, res, () => {})
  assert.equal(res.statusCode, 403)
})

test('requireWorkspaceRole allows matching role, blocks others', async () => {
  const { user, ws } = await seed('member')
  const req = { user, workspace: ws, membership: { role: 'member' } }
  const res = mockRes()
  let allowed = false
  requireWorkspaceRole('admin', 'owner')(req, res, () => { allowed = true })
  assert.equal(allowed, false)
  assert.equal(res.statusCode, 403)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/workspace-middleware.test.js`
Expected: FAIL — `Cannot find module '../middleware/workspace.js'`.

- [ ] **Step 3: Create the middleware**

Create `server/middleware/workspace.js`:

```js
import Workspace from '../models/Workspace.js'

// Resolve the active workspace for the request.
// Requires requireAuth to have run first (sets req.user).
export async function resolveWorkspace(req, res, next) {
  try {
    const headerId = req.headers['x-workspace-id']
    const targetId = headerId || req.user.defaultWorkspaceId
    if (!targetId) return res.status(400).json({ error: 'No active workspace' })

    const workspace = await Workspace.findById(targetId)
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' })

    const role = workspace.getMemberRole(req.user._id)
    if (!role) return res.status(403).json({ error: 'Not a member of this workspace' })

    req.workspace = workspace
    req.membership = { role }
    next()
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Gate an action on the caller's role within the active workspace.
export function requireWorkspaceRole(...roles) {
  return (req, res, next) => {
    if (!req.membership) return res.status(500).json({ error: 'resolveWorkspace must run first' })
    if (!roles.includes(req.membership.role)) {
      return res.status(403).json({ error: 'Insufficient workspace role' })
    }
    next()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/workspace-middleware.test.js`
Expected: PASS — all three tests.

- [ ] **Step 5: Commit**

```bash
git add server/middleware/workspace.js server/test/workspace-middleware.test.js
git commit -m "feat: add resolveWorkspace and requireWorkspaceRole middleware"
```

---

## Task 7: Create personal workspace on registration

**Files:**
- Modify: `server/routes/auth.js`, `server/utils/jwt.js`
- Test: `server/test/auth-register.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/auth-register.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import authRoutes from '../routes/auth.js'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function app() {
  const a = express()
  a.use(express.json())
  a.use(cookieParser())
  a.use('/api/auth', authRoutes)
  return a
}

test('register creates a personal workspace and returns defaultWorkspaceId', async () => {
  const res = await request(app())
    .post('/api/auth/register')
    .send({ name: 'Jane', email: 'jane@x.com', password: 'password123' })

  assert.equal(res.status, 201)
  assert.ok(res.body.user.defaultWorkspaceId, 'user has a default workspace')

  const ws = await Workspace.findById(res.body.user.defaultWorkspaceId)
  assert.equal(ws.type, 'personal')
  assert.equal(ws.getMemberRole(res.body.user._id), 'owner')

  const count = await Workspace.countDocuments({})
  assert.equal(count, 1)
})
```

Note: this test requires `JWT_SECRET`/`JWT_REFRESH_SECRET` env. The test runner loads `config.js` which calls `required('JWT_SECRET')`. Set these in Step 2.

- [ ] **Step 2: Provide test env**

Create `server/test/helpers/env.js`:

```js
// Loaded first via package.json test script ordering is not guaranteed,
// so set required env vars before any config import in tests that need them.
process.env.JWT_SECRET ||= 'test_jwt_secret_at_least_32_characters_long_x'
process.env.JWT_REFRESH_SECRET ||= 'test_refresh_secret_at_least_32_characters_x'
process.env.MONGODB_URI ||= 'mongodb://placeholder' // overridden by in-memory connect
process.env.AWS_REGION ||= 'us-east-1'
process.env.AWS_ACCESS_KEY_ID ||= 'test'
process.env.AWS_SECRET_ACCESS_KEY ||= 'test'
process.env.AWS_S3_BUCKET ||= 'test-bucket'
```

Add `import './helpers/env.js'` as the FIRST import line in `server/test/auth-register.test.js` (before any import that transitively loads `config.js`).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && node --test test/auth-register.test.js`
Expected: FAIL — `res.body.user.defaultWorkspaceId` is undefined (workspace not created).

- [ ] **Step 4: Update jwt.decodePayload**

In `server/utils/jwt.js`, replace `decodePayload`:

```js
export function decodePayload(userId, email, role, teamId) {
  return { userId, email, role, teamId }
}
```

with:

```js
export function decodePayload(userId, email, role) {
  return { userId, email, role }
}
```

- [ ] **Step 5: Update registration to create a personal workspace**

In `server/routes/auth.js`:

Add the import near the top (after the other imports):

```js
import { createPersonalWorkspace } from '../utils/workspace.js'
```

Replace the body of the `/register` handler's success path. Change:

```js
    const user = await User.create({ name, email, password })
    const accessToken  = signAccess({ userId: user._id, email: user.email, role: user.role })
    const refreshToken = signRefresh({ userId: user._id })
    res.cookie('refreshToken', refreshToken, cookieOpts())
    res.status(201).json({ user: user.toSafeObject(), accessToken })
```

to:

```js
    const user = await User.create({ name, email, password })
    await createPersonalWorkspace(user)
    const fresh = await User.findById(user._id) // reload to include defaultWorkspaceId
    const accessToken  = signAccess({ userId: fresh._id, email: fresh.email, role: fresh.role })
    const refreshToken = signRefresh({ userId: fresh._id })
    res.cookie('refreshToken', refreshToken, cookieOpts())
    res.status(201).json({ user: fresh.toSafeObject(), accessToken })
```

Also remove `teamId` from the `/login` and `/refresh` token signing. Change both occurrences of:

```js
    const accessToken  = signAccess({ userId: user._id, email: user.email, role: user.role, teamId: user.teamId })
```
and
```js
    const accessToken = signAccess({ userId: user._id, email: user.email, role: user.role, teamId: user.teamId })
```

to (drop `teamId`):

```js
    const accessToken = signAccess({ userId: user._id, email: user.email, role: user.role })
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && node --test test/auth-register.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/routes/auth.js server/utils/jwt.js server/test/auth-register.test.js server/test/helpers/env.js
git commit -m "feat: create personal workspace on registration"
```

---

## Task 8: Scope series routes by workspace

**Files:**
- Modify: `server/models/UsageLog.js`, `server/routes/series.js`
- Test: `server/test/series-routes.test.js`

- [ ] **Step 0: Add `workspaceId` to the UsageLog model**

In `server/models/UsageLog.js`, add a `workspaceId` field immediately after the `userId` field:

```js
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null, index: true },
```

(Default `null` keeps existing analytics/admin aggregations working; Tasks 8 & 9 populate it on new rows.)

- [ ] **Step 1: Write the failing test**

Create `server/test/series-routes.test.js`:

```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import seriesRoutes from '../routes/series.js'
import Series from '../models/Series.js'
import mongoose from 'mongoose'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

// Test app that injects a fake auth + workspace context (bypasses JWT).
function appFor(userId, workspaceId) {
  const a = express()
  a.use(express.json())
  a.use((req, _res, next) => {
    req.user = { _id: userId }
    req.workspace = { _id: workspaceId }
    req.membership = { role: 'owner' }
    next()
  })
  a.use('/api/series', seriesRoutes)
  return a
}

test('series list returns only the active workspace rows', async () => {
  const wsA = new mongoose.Types.ObjectId()
  const wsB = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()
  await Series.create({ userId: uid, workspaceId: wsA, title: 'A1', fullOutput: {} })
  await Series.create({ userId: uid, workspaceId: wsB, title: 'B1', fullOutput: {} })

  const res = await request(appFor(uid, wsA)).get('/api/series')
  assert.equal(res.status, 200)
  assert.equal(res.body.items.length, 1)
  assert.equal(res.body.items[0].title, 'A1')
})

test('series create stamps the active workspaceId', async () => {
  const ws = new mongoose.Types.ObjectId()
  const uid = new mongoose.Types.ObjectId()
  const res = await request(appFor(uid, ws))
    .post('/api/series')
    .send({ title: 'New', fullOutput: { ok: 1 } })
  assert.equal(res.status, 201)
  assert.equal(res.body.workspaceId, ws.toString())
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/series-routes.test.js`
Expected: FAIL — routes still filter by `userId`/`teamId`; create does not set `workspaceId` (validation error or wrong scoping).

- [ ] **Step 3: Rewrite series.js scoping**

Replace the full contents of `server/routes/series.js` with the workspace-scoped version:

```js
import { Router } from 'express'
import Series from '../models/Series.js'
import UsageLog from '../models/UsageLog.js'
import { requireAuth } from '../middleware/auth.js'
import { resolveWorkspace } from '../middleware/workspace.js'
import { apiLimiter } from '../middleware/rateLimit.js'

const router = Router()
router.use(requireAuth, resolveWorkspace, apiLimiter)

// GET /api/series — list the active workspace's series
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query
    const query = { workspaceId: req.workspace._id }
    if (search) query.title = { $regex: search, $options: 'i' }
    const [items, total] = await Promise.all([
      Series.find(query).select('-fullOutput -versions').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(Number(limit)),
      Series.countDocuments(query),
    ])
    res.json({ items, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/series/:id
router.get('/:id', async (req, res) => {
  try {
    const series = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    res.json(series)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/series — save generated series
router.post('/', async (req, res) => {
  try {
    const { title, author, logline, genrePreset, language, fullOutput, textProvider, totalCostUsd } = req.body
    if (!title || !fullOutput) return res.status(400).json({ error: 'title and fullOutput required' })
    const series = await Series.create({
      userId: req.user._id,
      workspaceId: req.workspace._id,
      title, author, logline, genrePreset, language, fullOutput, textProvider, totalCostUsd,
    })
    await UsageLog.create({ userId: req.user._id, workspaceId: req.workspace._id, seriesId: series._id, action: 'generate_text', provider: textProvider, costUsd: totalCostUsd ?? 0, success: true })
    res.status(201).json(series)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/series/:id
router.put('/:id', async (req, res) => {
  try {
    const series = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    const { title, fullOutput, tags, saveVersion, versionNote } = req.body
    if (saveVersion && series.fullOutput) series.saveVersion(versionNote)
    if (title)      series.title      = title
    if (fullOutput) series.fullOutput = fullOutput
    if (tags)       series.tags       = tags
    await series.save()
    res.json(series)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/series/:id
router.delete('/:id', async (req, res) => {
  try {
    const series = await Series.findOneAndDelete({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/series/:id/duplicate
router.post('/:id/duplicate', async (req, res) => {
  try {
    const original = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!original) return res.status(404).json({ error: 'Series not found' })
    const copy = await Series.create({
      userId:      req.user._id,
      workspaceId: req.workspace._id,
      title:       `${original.title} (copy)`,
      author:      original.author,
      logline:     original.logline,
      genrePreset: original.genrePreset,
      language:    original.language,
      fullOutput:  original.fullOutput,
      textProvider:original.textProvider,
    })
    res.status(201).json(copy)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/series/:id/share — enable public sharing
router.post('/:id/share', async (req, res) => {
  try {
    const series = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    const token = series.enableSharing()
    await series.save()
    res.json({ shareToken: token, shareUrl: `/share/${token}` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/series/:id/share — disable public sharing
router.delete('/:id/share', async (req, res) => {
  try {
    const series = await Series.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
    if (!series) return res.status(404).json({ error: 'Series not found' })
    series.disableSharing()
    await series.save()
    res.json({ message: 'Sharing disabled' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/series-routes.test.js`
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add server/routes/series.js server/test/series-routes.test.js
git commit -m "feat: scope series routes by workspace"
```

---

## Task 9: Scope asset routes & share route by workspace

**Files:**
- Modify: `server/routes/assets.js`, `server/routes/share.js`
- Test: `server/test/assets-routes.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/assets-routes.test.js`:

```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import assetRoutes from '../routes/assets.js'
import Asset from '../models/Asset.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function appFor(userId, workspaceId) {
  const a = express()
  a.use(express.json())
  a.use((req, _res, next) => {
    req.user = { _id: userId }
    req.workspace = { _id: workspaceId }
    req.membership = { role: 'owner' }
    next()
  })
  a.use('/api/assets', assetRoutes)
  return a
}

test('asset list returns only the active workspace assets for a series', async () => {
  const ws = new mongoose.Types.ObjectId()
  const otherWs = new mongoose.Types.ObjectId()
  const seriesId = new mongoose.Types.ObjectId()
  const base = { seriesId, type: 'character_image', assetKey: 'k', s3Key: 'k', s3Url: 'u', s3Bucket: 'b' }
  await Asset.create({ ...base, userId: new mongoose.Types.ObjectId(), workspaceId: ws })
  await Asset.create({ ...base, userId: new mongoose.Types.ObjectId(), workspaceId: otherWs })

  const res = await request(appFor(new mongoose.Types.ObjectId(), ws)).get(`/api/assets/${seriesId}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/assets-routes.test.js`
Expected: FAIL — list ignores workspace, returns 2.

- [ ] **Step 3: Update assets.js**

In `server/routes/assets.js`:

Add the workspace middleware import after the `requireAuth` import:

```js
import { resolveWorkspace } from '../middleware/workspace.js'
```

Change the router guard line:

```js
router.use(requireAuth)
```

to:

```js
router.use(requireAuth, resolveWorkspace)
```

Change the list query in `GET /:seriesId` from:

```js
    const assets = await Asset.find({ seriesId: req.params.seriesId }).sort({ createdAt: 1 })
```

to:

```js
    const assets = await Asset.find({ seriesId: req.params.seriesId, workspaceId: req.workspace._id }).sort({ createdAt: 1 })
```

In all three upload handlers (`/image`, `/video`, `/audio`), replace `teamId: req.user.teamId,` with `workspaceId: req.workspace._id,`. In the three `UsageLog.create({ ... })` calls add `workspaceId: req.workspace._id,` after `userId: req.user._id,`.

In `DELETE /:id`, change the lookup from:

```js
    const asset = await Asset.findOne({ _id: req.params.id, userId: req.user._id })
```

to:

```js
    const asset = await Asset.findOne({ _id: req.params.id, workspaceId: req.workspace._id })
```

- [ ] **Step 4: Update share.js select**

In `server/routes/share.js`, change:

```js
      .select('-versions -userId -teamId')
```

to:

```js
      .select('-versions -userId -workspaceId')
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && node --test test/assets-routes.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/assets.js server/routes/share.js server/test/assets-routes.test.js
git commit -m "feat: scope asset and share routes by workspace"
```

---

## Task 10: Workspaces route (replaces teams route)

**Files:**
- Create: `server/routes/workspaces.js`
- Test: `server/test/workspaces-routes.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/workspaces-routes.test.js`:

```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import workspaceRoutes from '../routes/workspaces.js'
import Workspace from '../models/Workspace.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

function appFor(user) {
  const a = express()
  a.use(express.json())
  a.use((req, _res, next) => { req.user = user; next() })
  a.use('/api/workspaces', workspaceRoutes)
  return a
}

test('GET /api/workspaces lists workspaces the user is a member of', async () => {
  const uid = new mongoose.Types.ObjectId()
  await Workspace.create({ name: 'Mine', type: 'personal', ownerId: uid, members: [{ userId: uid, role: 'owner' }] })
  await Workspace.create({ name: 'NotMine', type: 'organization', ownerId: new mongoose.Types.ObjectId(), members: [{ userId: new mongoose.Types.ObjectId(), role: 'owner' }] })

  const res = await request(appFor({ _id: uid })).get('/api/workspaces')
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
  assert.equal(res.body[0].name, 'Mine')
})

test('POST /api/workspaces creates an organization workspace with caller as owner', async () => {
  const uid = new mongoose.Types.ObjectId()
  const res = await request(appFor({ _id: uid })).post('/api/workspaces').send({ name: 'Acme' })
  assert.equal(res.status, 201)
  assert.equal(res.body.type, 'organization')
  assert.equal(res.body.members[0].role, 'owner')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/workspaces-routes.test.js`
Expected: FAIL — `Cannot find module '../routes/workspaces.js'`.

- [ ] **Step 3: Create workspaces.js**

Create `server/routes/workspaces.js` (ports teams.js onto the Workspace model; org-create only — personal workspaces come from registration):

```js
import { Router } from 'express'
import crypto from 'crypto'
import Workspace from '../models/Workspace.js'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import { sendEmail, teamInviteEmail } from '../utils/email.js'
import { config } from '../config.js'

const router = Router()
router.use(requireAuth)

// GET /api/workspaces — all workspaces the user belongs to
router.get('/', async (req, res) => {
  try {
    const list = await Workspace.find({ 'members.userId': req.user._id }).sort({ createdAt: 1 })
    res.json(list)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces/switch — set the user's default (active) workspace
router.post('/switch', async (req, res) => {
  try {
    const { workspaceId } = req.body
    const ws = await Workspace.findById(workspaceId)
    if (!ws || !ws.hasMember(req.user._id)) return res.status(403).json({ error: 'Not a member of this workspace' })
    await User.findByIdAndUpdate(req.user._id, { defaultWorkspaceId: ws._id })
    res.json({ activeWorkspaceId: ws._id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/workspaces/:id/members
router.get('/:id/members', async (req, res) => {
  try {
    const ws = await Workspace.findById(req.params.id).populate('members.userId', 'name email avatar')
    if (!ws || !ws.hasMember(req.user._id)) return res.status(403).json({ error: 'Not a member of this workspace' })
    res.json(ws.members)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces — create an organization workspace
router.post('/', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'Workspace name required' })
    const ws = await Workspace.create({
      name, type: 'organization', ownerId: req.user._id,
      members: [{ userId: req.user._id, role: 'owner' }],
    })
    res.status(201).json(ws)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/workspaces/:id — update settings (owner only)
router.put('/:id', async (req, res) => {
  try {
    const ws = await Workspace.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!ws) return res.status(403).json({ error: 'Not workspace owner' })
    const { name, settings } = req.body
    if (name)     ws.name = name
    if (settings) Object.assign(ws.settings, settings)
    await ws.save()
    res.json(ws)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces/:id/invite — invite a member (owner/admin)
router.post('/:id/invite', async (req, res) => {
  try {
    const { email, role = 'member' } = req.body
    const ws = await Workspace.findById(req.params.id)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    if (!['owner', 'admin'].includes(ws.getMemberRole(req.user._id))) return res.status(403).json({ error: 'Need admin role to invite' })
    const token = crypto.randomBytes(20).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 86400000)
    ws.invites = ws.invites.filter(i => i.email !== email.toLowerCase())
    ws.invites.push({ email: email.toLowerCase(), role, token, expiresAt, invitedBy: req.user._id })
    await ws.save()
    const url = `${config.clientUrl}/invite?token=${token}`
    await sendEmail({ to: email, subject: `You're invited to ${ws.name} — BookFilm Studio`, html: teamInviteEmail(req.user.name, ws.name, url) })
    res.json({ message: `Invitation sent to ${email}` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/workspaces/accept-invite
router.post('/accept-invite', async (req, res) => {
  try {
    const { token } = req.body
    const ws = await Workspace.findOne({ 'invites.token': token, 'invites.expiresAt': { $gt: new Date() } })
    if (!ws) return res.status(400).json({ error: 'Invalid or expired invitation' })
    const invite = ws.invites.find(i => i.token === token)
    if (invite.email !== req.user.email.toLowerCase()) return res.status(403).json({ error: 'Invitation is for a different email' })
    if (!ws.hasMember(req.user._id)) ws.members.push({ userId: req.user._id, role: invite.role })
    ws.invites = ws.invites.filter(i => i.token !== token)
    await ws.save()
    res.json({ workspace: ws, message: 'Joined workspace successfully' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/workspaces/:id/members/:userId — change member role (owner)
router.patch('/:id/members/:userId', async (req, res) => {
  try {
    const ws = await Workspace.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!ws) return res.status(403).json({ error: 'Not workspace owner' })
    const member = ws.members.find(m => m.userId.toString() === req.params.userId)
    if (!member) return res.status(404).json({ error: 'Member not found' })
    member.role = req.body.role
    await ws.save()
    res.json(ws)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/workspaces/:id/members/:userId — remove member (owner/admin)
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const ws = await Workspace.findById(req.params.id)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    if (!['owner', 'admin'].includes(ws.getMemberRole(req.user._id))) return res.status(403).json({ error: 'Insufficient role' })
    ws.members = ws.members.filter(m => m.userId.toString() !== req.params.userId)
    await ws.save()
    res.json({ message: 'Member removed' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/workspaces-routes.test.js`
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add server/routes/workspaces.js server/test/workspaces-routes.test.js
git commit -m "feat: add workspaces route (replaces teams route)"
```

---

## Task 11: Wire routes in server entry; remove Team

**Files:**
- Modify: `server/index.js`, `server/middleware/auth.js`
- Delete: `server/routes/teams.js`, `server/models/Team.js`

- [ ] **Step 1: Update index.js route wiring**

In `server/index.js`:

Replace the import:

```js
import teamRoutes      from './routes/teams.js'
```

with:

```js
import workspaceRoutes from './routes/workspaces.js'
```

Replace the mount:

```js
app.use('/api/teams',     teamRoutes)
```

with:

```js
app.use('/api/workspaces', workspaceRoutes)
```

- [ ] **Step 2: Remove requireTeamRole from middleware/auth.js**

In `server/middleware/auth.js`, delete the entire `requireTeamRole` export (lines defining `export function requireTeamRole(...)`). Leave `requireAuth`, `requireRole`, and `optionalAuth` intact.

- [ ] **Step 3: Delete the Team model and route**

Run:

```bash
git rm server/routes/teams.js server/models/Team.js
```

- [ ] **Step 4: Verify no remaining references to Team**

Run: `cd server && grep -rn "models/Team\|routes/teams\|requireTeamRole\|req.user.teamId\|teamRoutes" --include="*.js" . | grep -v node_modules`
Expected: **no output** (no remaining references).

If anything appears (e.g. in `share.js`, `analytics.js`, or `admin.js`), fix it: replace `teamId` reads with `workspaceId`/removal as appropriate. (`analytics.js` and `admin.js` UsageLog aggregations should group by `workspaceId` going forward, but only change lines that currently reference `teamId`/`Team`.)

- [ ] **Step 5: Run the full server test suite**

Run: `cd server && npm test`
Expected: PASS — all tests green; no import errors for deleted modules.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/middleware/auth.js
git commit -m "refactor: replace teams route/model with workspaces; drop requireTeamRole"
```

---

## Task 12: Backfill migration script

**Files:**
- Create: `server/scripts/backfill-workspaces.js`
- Test: `server/test/backfill.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/backfill.test.js`:

```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import User from '../models/User.js'
import Workspace from '../models/Workspace.js'
import Series from '../models/Series.js'
import { runBackfill } from '../scripts/backfill-workspaces.js'

before(startTestDB)
after(stopTestDB)
beforeEach(clearTestDB)

test('gives every user a personal workspace and stamps their series', async () => {
  const user = await User.create({ name: 'Solo', email: 'solo@x.com', password: 'password123' })
  // legacy series created before workspaceId existed — insert raw to bypass required validation
  const legacy = await Series.collection.insertOne({ userId: user._id, title: 'Legacy', fullOutput: {}, createdAt: new Date(), updatedAt: new Date() })

  await runBackfill()

  const reloaded = await User.findById(user._id)
  assert.ok(reloaded.defaultWorkspaceId, 'user got a default workspace')
  const stamped = await Series.collection.findOne({ _id: legacy.insertedId })
  assert.equal(stamped.workspaceId.toString(), reloaded.defaultWorkspaceId.toString())
})

test('is idempotent — running twice does not create duplicate workspaces', async () => {
  await User.create({ name: 'Solo', email: 'solo2@x.com', password: 'password123' })
  await runBackfill()
  await runBackfill()
  assert.equal(await Workspace.countDocuments({ type: 'personal' }), 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/backfill.test.js`
Expected: FAIL — `Cannot find module '../scripts/backfill-workspaces.js'`.

- [ ] **Step 3: Create the migration script**

Create `server/scripts/backfill-workspaces.js`:

```js
import mongoose from 'mongoose'
import { config } from '../config.js'
import User from '../models/User.js'
import Series from '../models/Series.js'
import Asset from '../models/Asset.js'
import Workspace from '../models/Workspace.js'
import { createPersonalWorkspace } from '../utils/workspace.js'

// Core migration logic — exported so it can be tested against an in-memory DB.
export async function runBackfill() {
  // 1. Convert any legacy Teams (collection may not exist post-removal; read raw).
  const teamWorkspaceMap = new Map() // teamId(str) -> workspaceId
  let legacyTeams = []
  try {
    legacyTeams = await mongoose.connection.collection('teams').find({}).toArray()
  } catch { legacyTeams = [] }

  for (const team of legacyTeams) {
    const existing = await Workspace.findOne({ migratedFromTeamId: team._id })
    if (existing) { teamWorkspaceMap.set(team._id.toString(), existing._id); continue }
    const members = (team.members || []).map(m => ({
      userId: m.userId,
      role: m.role === 'owner' ? 'owner' : m.role === 'admin' ? 'admin' : 'member',
    }))
    const ws = await Workspace.create({
      name: team.name || 'Workspace',
      type: 'organization',
      ownerId: team.ownerId,
      plan: ['pro', 'studio'].includes(team.plan) ? team.plan : 'free',
      members: members.length ? members : [{ userId: team.ownerId, role: 'owner' }],
      migratedFromTeamId: team._id,
    })
    teamWorkspaceMap.set(team._id.toString(), ws._id)
  }

  // 2. Ensure every user has a personal workspace + defaultWorkspaceId.
  const users = await User.find({})
  for (const user of users) {
    if (!user.defaultWorkspaceId) await createPersonalWorkspace(user)
  }

  // 3. Stamp legacy Series/Asset rows that lack workspaceId.
  //    Prefer the user's old teamId workspace if present, else their personal workspace.
  for (const Model of [Series, Asset]) {
    const rows = await Model.collection.find({ workspaceId: { $exists: false } }).toArray()
    for (const row of rows) {
      let wsId = row.teamId ? teamWorkspaceMap.get(row.teamId.toString()) : null
      if (!wsId) {
        const owner = await User.findById(row.userId)
        wsId = owner?.defaultWorkspaceId
      }
      if (wsId) {
        await Model.collection.updateOne({ _id: row._id }, { $set: { workspaceId: wsId }, $unset: { teamId: '' } })
      }
    }
  }

  return { teams: teamWorkspaceMap.size, users: users.length }
}

// CLI entrypoint — only runs when invoked directly (not when imported by tests).
const isDirectRun = process.argv[1] && process.argv[1].endsWith('backfill-workspaces.js')
if (isDirectRun) {
  mongoose.connect(config.mongoUri).then(async () => {
    const result = await runBackfill()
    console.log('✓ Backfill complete:', result)
    await mongoose.disconnect()
    process.exit(0)
  }).catch(err => { console.error('✗ Backfill failed:', err); process.exit(1) })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/backfill.test.js`
Expected: PASS — both tests.

- [ ] **Step 5: Run the full suite**

Run: `cd server && npm test`
Expected: PASS — all suites.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/backfill-workspaces.js server/test/backfill.test.js
git commit -m "feat: add idempotent workspace backfill migration"
```

---

## Task 13: Client — send X-Workspace-Id and add workspaces namespace

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add active-workspace state + header**

In `src/lib/api.js`, after the access-token state block:

```js
let _accessToken = null

export function setAccessToken(token) { _accessToken = token }
export function getAccessToken()      { return _accessToken }
export function clearAccessToken()    { _accessToken = null }
```

add:

```js
let _workspaceId = null
export function setActiveWorkspace(id) { _workspaceId = id }
export function getActiveWorkspace()   { return _workspaceId }
```

- [ ] **Step 2: Attach the header in `request()`**

In the `request()` function, change the header-building line:

```js
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`
```

to:

```js
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`
  if (_workspaceId) headers['X-Workspace-Id'] = _workspaceId
```

- [ ] **Step 3: Replace the `teams` namespace with `workspaces`**

In `src/lib/api.js`, replace the entire `export const teams = { ... }` block with:

```js
// ── Workspaces ──────────────────────────────────────────────────────────────
export const workspaces = {
  list:          ()           => get('/api/workspaces'),
  switch:        (workspaceId)=> post('/api/workspaces/switch', { workspaceId }),
  members:       (id)         => get(`/api/workspaces/${id}/members`),
  create:        (data)       => post('/api/workspaces', data),
  update:        (id, data)   => put(`/api/workspaces/${id}`, data),
  invite:        (id, data)   => post(`/api/workspaces/${id}/invite`, data),
  acceptInvite:  (token)      => post('/api/workspaces/accept-invite', { token }),
  updateMember:  (id, uid, data) => patch(`/api/workspaces/${id}/members/${uid}`, data),
  removeMember:  (id, uid)    => del(`/api/workspaces/${id}/members/${uid}`),
}
```

- [ ] **Step 4: Verify the frontend still builds**

Run: `npm run build`
Expected: build succeeds. If any file imported `teams` from `../lib/api`, update that import to `workspaces` (search: `grep -rn "teams" src --include="*.jsx" --include="*.js"`). At time of writing, only `src/lib/api.js` defines/uses it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.js
git commit -m "feat: send X-Workspace-Id header; add workspaces api namespace"
```

---

## Task 14: Client — load workspace context in AuthContext

**Files:**
- Modify: `src/contexts/AuthContext.jsx`

- [ ] **Step 1: Wire workspace loading into the auth bootstrap**

In `src/contexts/AuthContext.jsx`:

Change the import line:

```js
import { auth as authApi, users as usersApi, setAccessToken, clearAccessToken } from '../lib/api'
```

to:

```js
import { auth as authApi, users as usersApi, workspaces as workspacesApi, setAccessToken, clearAccessToken, setActiveWorkspace } from '../lib/api'
```

Add workspace state inside `AuthProvider`, after the `user`/`loading` state:

```js
  const [activeWorkspace, setActiveWorkspaceState] = useState(null)
```

In the mount `useEffect`, after `setUser(u)` resolves, set the active workspace from the user's default. Replace:

```js
      .then(u => setUser(u))
```

with:

```js
      .then(u => {
        setUser(u)
        if (u?.defaultWorkspaceId) {
          setActiveWorkspace(u.defaultWorkspaceId)
          setActiveWorkspaceState(u.defaultWorkspaceId)
        }
      })
```

In `login` and `register`, after `setUser(...)`, set the workspace. In `login`, after `setUser(data.user)` add:

```js
    if (data.user?.defaultWorkspaceId) { setActiveWorkspace(data.user.defaultWorkspaceId); setActiveWorkspaceState(data.user.defaultWorkspaceId) }
```

and the same two lines after `setUser(data.user)` in `register`.

Add a `switchWorkspace` callback before the `value` memo:

```js
  const switchWorkspace = useCallback(async (workspaceId) => {
    await workspacesApi.switch(workspaceId)
    setActiveWorkspace(workspaceId)
    setActiveWorkspaceState(workspaceId)
  }, [])
```

Add `activeWorkspace` and `switchWorkspace` to the context `value` memo and its dependency array:

```js
  const value = useMemo(() => ({ user, loading, activeWorkspace, login, register, logout, updateUser, switchWorkspace, isAdmin: user?.role === 'admin' }), [user, loading, activeWorkspace, login, register, logout, updateUser, switchWorkspace])
```

In the `logout` callback, clear it — after `setUser(null)` add:

```js
    setActiveWorkspace(null)
    setActiveWorkspaceState(null)
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AuthContext.jsx
git commit -m "feat: load and track active workspace in AuthContext"
```

---

## Task 15: Full verification

- [ ] **Step 1: Run the complete server test suite**

Run: `cd server && npm test`
Expected: PASS — all suites (smoke, workspace-model, user-model, scoped-models, workspace-helper, workspace-middleware, auth-register, series-routes, assets-routes, workspaces-routes, backfill).

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Confirm no lingering Team references**

Run: `cd server && grep -rn "Team\|teamId" --include="*.js" . | grep -v node_modules | grep -v "migratedFromTeamId"`
Expected: no output (other than the intentional `migratedFromTeamId` field/uses).

- [ ] **Step 4: Push the branch**

```bash
git push origin main
```

---

## Self-Review (completed during planning)

**Spec coverage (§3 Workspace tenancy):**
- Workspace entity with `type`/`managedBeta` → Task 2. ✓
- Personal workspace on registration → Task 7. ✓
- `Workspace.members` source of truth; `User.teamId` replaced by `defaultWorkspaceId` → Tasks 3, 7. ✓
- `resolveWorkspace` (header → default, membership check) + `requireWorkspaceRole` → Task 6. ✓
- `Series`/`Asset` re-scoped to `workspaceId`, `createdBy` (userId) retained → Tasks 4, 8, 9. ✓
- `managedBeta` on workspace → Task 2 (enforcement is plan 1D, correctly out of scope here). ✓
- Backfill migration (personal workspaces, Team→org conversion, stamp existing rows, idempotent, empty-DB-safe) → Task 12. ✓
- `/api/workspaces` endpoints (list/switch/members) → Task 10. ✓
- Client `X-Workspace-Id` + `workspaces` namespace + AuthContext bootstrap → Tasks 13, 14. ✓

**Out of scope confirmed deferred:** generation endpoints, `Job` model, `UsageLog.workspaceId` aggregation in analytics/admin (the field is added in Task 8 Step 0; aggregations that group by it come in later plans), managed caps/allowlist enforcement — all belong to later phase-plans.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type/name consistency:** `createPersonalWorkspace` (Tasks 5,7,12), `resolveWorkspace`/`requireWorkspaceRole` (Tasks 6,8,9), `setActiveWorkspace` (Tasks 13,14), `defaultWorkspaceId` (Tasks 3,5,7,14), `workspaceId` (Tasks 4,8,9,12), `UsageLog.workspaceId` (Task 8 Step 0, written in Tasks 8,9) — names consistent across tasks. ✓
