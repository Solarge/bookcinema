# Sub-project #6 — Legal / Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Cover the basic legal/compliance surface: capture **consent** at signup (Terms + Privacy), let users **export their data** (GDPR access) and **delete their account** (GDPR erasure), and ship Terms/Privacy pages (placeholder content, flagged for real legal review).

**Architecture:**
- **Consent:** `User.consentedAt` timestamp; `POST /api/auth/register` accepts `consent: true` and stamps it (rejects 400 if absent). The client RegisterPage requires checking a "I agree to the Terms & Privacy Policy" box.
- **Data export:** `GET /api/users/me/export` returns the caller's data (profile + workspaces they belong to + series in those workspaces + their usage log) as a downloadable JSON.
- **Account deletion:** `DELETE /api/users/me` erases the user + their **personal** workspace and its data (series/assets/jobs/credit-transactions/usage). If the user solely-owns an **organization** workspace with other members, block with 409 (must transfer/remove members first) — avoids orphaning a team.
- **Legal pages:** Terms + Privacy as React components (placeholder text + a clear "DRAFT — not legal advice" banner), reachable from the login/register footer and the account modal.

**Tech stack:** Express + Mongoose, node:test + in-memory mongo + supertest; React frontend (build-gated). Builds on existing auth/workspace/series models.

**Scope:** consent + export + delete + placeholder legal pages. NOT real legal copy (needs a lawyer), cookie-consent banners, or data-processing agreements.

---

## Task 1: backend — consent, data export, account deletion

**Files:** Modify `server/models/User.js`, `server/routes/auth.js`, `server/routes/users.js`; Test `server/test/legal-routes.test.js`

- [ ] **Step 1 — failing test** `server/test/legal-routes.test.js`:
```js
import './helpers/env.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import mongoose from 'mongoose'
import { startTestDB, stopTestDB, clearTestDB } from './helpers/db.js'
import authRoutes from '../routes/auth.js'
import userRoutes from '../routes/users.js'
import Workspace from '../models/Workspace.js'
import Series from '../models/Series.js'
import { makeAuthedUser } from './helpers/auth.js'

before(startTestDB); after(stopTestDB); beforeEach(clearTestDB)
function authApp() { const a = express(); a.use(express.json()); a.use(cookieParser()); a.use('/api/auth', authRoutes); return a }
function userApp() { const a = express(); a.use(express.json()); a.use('/api/users', userRoutes); return a }
const authed = (r, t) => r.set('Authorization', `Bearer ${t}`)

test('register requires consent (400 without it)', async () => {
  const res = await request(authApp()).post('/api/auth/register').send({ name: 'A', email: 'a@x.com', password: 'password123' })
  assert.equal(res.status, 400)
})
test('register stamps consentedAt when consent given', async () => {
  const res = await request(authApp()).post('/api/auth/register').send({ name: 'A', email: 'b@x.com', password: 'password123', consent: true })
  assert.equal(res.status, 201)
  assert.ok(res.body.user.consentedAt)
})
test('GET /me/export returns the user data bundle', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'S', fullOutput: {} })
  const res = await authed(request(userApp()).get('/api/users/me/export'), token)
  assert.equal(res.status, 200)
  assert.equal(res.body.user.email, user.email)
  assert.ok(Array.isArray(res.body.workspaces))
  assert.ok(Array.isArray(res.body.series))
  assert.equal(res.body.series.length, 1)
})
test('DELETE /me erases the user + personal workspace + series', async () => {
  const { user, token, workspace } = await makeAuthedUser()
  await Series.create({ userId: user._id, workspaceId: workspace._id, title: 'S', fullOutput: {} })
  const res = await authed(request(userApp()).delete('/api/users/me'), token)
  assert.equal(res.status, 200)
  const { default: User } = await import('../models/User.js')
  assert.equal(await User.countDocuments({ _id: user._id }), 0)
  assert.equal(await Workspace.countDocuments({ _id: workspace._id }), 0)
  assert.equal(await Series.countDocuments({ workspaceId: workspace._id }), 0)
})
test('DELETE /me blocks if user solely-owns an org with other members (409)', async () => {
  const { user, token } = await makeAuthedUser()
  await Workspace.create({ name: 'Org', type: 'organization', ownerId: user._id, members: [{ userId: user._id, role: 'owner' }, { userId: new mongoose.Types.ObjectId(), role: 'member' }] })
  const res = await authed(request(userApp()).delete('/api/users/me'), token)
  assert.equal(res.status, 409)
})
```

- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — `server/models/User.js`:** add `consentedAt: { type: Date, default: null }` (near the other fields).
- [ ] **Step 4 — `server/routes/auth.js` /register:** require consent. After validating name/email/password, add:
```js
    if (!req.body.consent) return res.status(400).json({ error: 'You must accept the Terms and Privacy Policy' })
```
and set `consentedAt: new Date()` in the `User.create({...})` call (add the field).
- [ ] **Step 5 — `server/routes/users.js`:** add export + delete (both behind the existing `requireAuth`). Import the models needed (Workspace, Series, Asset, Job, UsageLog, CreditTransaction — import what exists; use dynamic or top imports). Add:
```js
// GET /api/users/me/export — GDPR data access (downloadable JSON)
router.get('/me/export', async (req, res) => {
  try {
    const Workspace = (await import('../models/Workspace.js')).default
    const Series = (await import('../models/Series.js')).default
    const UsageLog = (await import('../models/UsageLog.js')).default
    const workspaces = await Workspace.find({ 'members.userId': req.user._id }).lean()
    const wsIds = workspaces.map(w => w._id)
    const series = await Series.find({ workspaceId: { $in: wsIds } }).select('-versions').lean()
    const usage = await UsageLog.find({ userId: req.user._id }).lean()
    res.setHeader('Content-Disposition', 'attachment; filename=bookfilm-my-data.json')
    res.json({ exportedAt: new Date().toISOString(), user: req.user.toSafeObject(), workspaces, series, usage })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/users/me — GDPR erasure
router.delete('/me', async (req, res) => {
  try {
    const Workspace = (await import('../models/Workspace.js')).default
    const Series = (await import('../models/Series.js')).default
    const Asset = (await import('../models/Asset.js')).default
    const Job = (await import('../models/Job.js')).default
    const UsageLog = (await import('../models/UsageLog.js')).default
    const CreditTransaction = (await import('../models/CreditTransaction.js')).default
    const User = (await import('../models/User.js')).default

    // Block if the user solely-owns an organization workspace that has other members.
    const ownedOrgs = await Workspace.find({ ownerId: req.user._id, type: 'organization' })
    const blocking = ownedOrgs.find(w => (w.members || []).some(m => m.userId.toString() !== req.user._id.toString()))
    if (blocking) return res.status(409).json({ error: 'Transfer or remove members from your organization workspaces before deleting your account' })

    // Erase the user's personal workspace(s) + their data.
    const personalWs = await Workspace.find({ ownerId: req.user._id, type: 'personal' })
    const wsIds = personalWs.map(w => w._id)
    if (wsIds.length) {
      await Series.deleteMany({ workspaceId: { $in: wsIds } })
      await Asset.deleteMany({ workspaceId: { $in: wsIds } })
      await Job.deleteMany({ workspaceId: { $in: wsIds } })
      await CreditTransaction.deleteMany({ workspaceId: { $in: wsIds } })
      await Workspace.deleteMany({ _id: { $in: wsIds } })
    }
    await UsageLog.deleteMany({ userId: req.user._id })
    // Remove the user from any org memberships they belong to.
    await Workspace.updateMany({ 'members.userId': req.user._id }, { $pull: { members: { userId: req.user._id } } })
    await User.findByIdAndDelete(req.user._id)
    res.json({ message: 'Account deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
```
- [ ] **Step 6 — run → PASS (all 5). Commit** `feat: consent at signup + data export + account deletion (GDPR) [#6 T1]`

---

## Task 2: client — consent checkbox, legal pages, export/delete UI

**Files:** Create `src/components/legal/LegalPages.jsx`; Modify `src/contexts/AuthContext.jsx` (register passes consent), `src/components/auth/RegisterPage.jsx`, `src/components/auth/LoginPage.jsx` (footer link), `src/components/dashboard/ProfilePage.jsx`, `src/lib/api.js`

- [ ] **Step 1 — api.js:** in `auth`, change `register` to accept consent: `register: (data) => post('/api/auth/register', data)` (already passes the whole object — ensure the client includes `consent`). In `users`, add `exportData: () => get('/api/users/me/export')` and `deleteAccount: () => del('/api/users/me')`.
- [ ] **Step 2 — `AuthContext` register:** the `register(name, email, password, consent)` callback should pass `consent` through to `authApi.register({ name, email, password, consent })`. Update the signature + call.
- [ ] **Step 3 — `LegalPages.jsx`:** export `TermsOfService` and `PrivacyPolicy` components — modal-style overlays (like ProfilePage) with PLACEHOLDER content and a prominent "⚠ DRAFT — placeholder text, not legal advice; replace before launch" banner. Cover the basics in plain language (what data is collected, managed generation uses 3rd-party AI providers, credits/billing via Stripe, data export/delete rights, contact = ADMIN_EMAIL placeholder). Export a small `LegalLinks` component (two buttons "Terms" / "Privacy") that toggles which modal shows.
- [ ] **Step 4 — RegisterPage:** add a required consent checkbox ("I agree to the Terms of Service and Privacy Policy", with the two words as buttons opening the legal modals). Disable the Create Account button until checked. Pass `consent: true` to `register(...)`. Show the LegalLinks.
- [ ] **Step 5 — LoginPage:** add the LegalLinks (Terms/Privacy) to the footer.
- [ ] **Step 6 — ProfilePage:** in the profile tab (or a new "Data" section), add "Export my data" (calls `usersApi.exportData()`, triggers a JSON download via a Blob) and "Delete account" (confirm dialog → `usersApi.deleteAccount()` → on success call `logout()`). Handle the 409 (owns an org) gracefully via setMsg.
- [ ] **Step 7 — `npm run build` → success. Commit** `feat(ui): consent checkbox, Terms/Privacy pages, data export + delete account [#6 T2]`

---

## Task 3: verification
- [ ] `cd server && npm test` → all pass.
- [ ] `npm run build` → success.
- [ ] Push.

---

## Self-Review (planning)
**Coverage:** consent capture (T1 register + T2 checkbox), data export (T1 + T2 download), erasure with org-ownership guard (T1 + T2), legal pages (T2, placeholder + draft banner). 
**Deferred:** real legal copy (lawyer), cookie banner, ownership-transfer flow (currently delete is blocked if you solely-own an org with members — transfer is a #5/later feature). 
**Risk:** account deletion is destructive — guarded against orphaning org workspaces; personal data cascade is explicit. The delete cascade lists specific collections; if a new per-workspace collection is added later, update the cascade.
