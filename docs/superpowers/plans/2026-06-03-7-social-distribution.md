# Sub-project #7 — Social Distribution (multi-platform publish + schedule)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Server tests = node:test + mongodb-memory-server + supertest, REDIS_URL blanked (hermetic). Frontend = `npm run build` gate (no test runner).

**Goal:** Let a workspace connect its social accounts (YouTube, TikTok, Instagram/Facebook, X/Twitter, LinkedIn), then **schedule a generated video** to auto-post to selected platforms at a chosen time. Built **provider-registry style** so each platform "lights up" the moment its OAuth credentials are added to the server env; with no credentials a platform shows a clear "needs setup" state and is never offered for live posting.

## Locked decisions
- **Tenant:** social accounts + scheduled posts are **workspace-scoped** (reuse resolveWorkspace + X-Workspace-Id).
- **All 5 platforms**, built ready; live posting gated per-platform on env credentials (user has none yet).
- **Scheduling:** BullMQ **delayed jobs** on the existing Redis (`socialPublishQueue`); a publisher worker fires at `scheduledAt`.
- **Video source:** the post references an asset **URL in S3** (managed-generated videos already land in S3; a BYO video needs uploading first — out of scope for v1, the UI accepts an S3/asset URL the workspace already owns).
- **Token security:** OAuth tokens encrypted at rest (AES-256-GCM, key from `SOCIAL_TOKEN_KEY`); never returned to the client.
- **Auth:** all routes require login; OAuth `state` is a signed, expiring token binding the workspace + platform (CSRF-safe).

## Provider/adapter contract (`server/social/providers/<platform>.js`)
Each module exports:
- `meta = { key, label, configEnv: ['X_CLIENT_ID','X_CLIENT_SECRET'], scopes }`
- `isConfigured()` — true when its env creds are present
- `getAuthUrl({ redirectUri, state })` → string
- `exchangeCode({ code, redirectUri })` → `{ account: { externalId, displayName, ... }, tokens: { accessToken, refreshToken, expiresAt } }`
- `refresh({ refreshToken })` → `{ accessToken, refreshToken?, expiresAt }` (or throws if unsupported)
- `publishVideo({ tokens, videoUrl, caption, title })` → `{ externalId, url }`
Registry `server/social/index.js`: `SOCIAL_PROVIDERS` map + `getProvider(key)` + `listConfigured()`.

---

## Task 1: foundation — models, crypto, config, adapter registry + stubs
**Files:** Create `server/models/SocialAccount.js`, `server/models/ScheduledPost.js`, `server/utils/cryptoTokens.js`, `server/social/index.js`, `server/social/providers/{youtube,tiktok,meta,twitter,linkedin}.js`; Modify `server/config.js`; Test `server/test/social-foundation.test.js`.

- [ ] **SocialAccount**: `{ workspaceId(ref,index), platform(enum youtube/tiktok/meta/twitter/linkedin), externalId, displayName, accessTokenEnc, refreshTokenEnc, expiresAt, scopes[], connectedBy(ref User), createdAt }`. Unique compound index `{ workspaceId, platform, externalId }`. A `toClient()` method that NEVER includes the encrypted tokens (returns id, platform, displayName, expiresAt, connectedAt).
- [ ] **ScheduledPost**: `{ workspaceId(ref,index), createdBy(ref), videoUrl, title, caption, perPlatformCaption(Map/obj), targets[{ platform, socialAccountId, status(enum pending/posting/posted/failed/skipped), externalId, postUrl, error }], scheduledAt(Date,index), status(enum scheduled/processing/completed/partial/failed/canceled), jobId, createdAt }`.
- [ ] **`server/utils/cryptoTokens.js`**: `encryptToken(plain)` / `decryptToken(enc)` using AES-256-GCM with a 32-byte key derived from `config.social.tokenKey` (scrypt/sha256). Format `ivHex:tagHex:cipherHex`. If no key configured, throw a clear error (so tests set a key via env helper).
- [ ] **`server/config.js`**: add `config.social = { tokenKey, redirectBase (default `${clientUrl}` or API base), platforms: { youtube: {clientId, clientSecret}, tiktok:{...}, meta:{clientId, clientSecret}, twitter:{clientId, clientSecret}, linkedin:{clientId, clientSecret} } }`. All optional (no throw on missing — unlike the hard-required vars).
- [ ] **Adapters (stubs in T1):** each provider module exports the full contract; `isConfigured()` reads its env; `getAuthUrl/exchangeCode/refresh/publishVideo` may throw `new Error('<platform> not configured')` when `!isConfigured()`. Real API wiring is T4 — in T1 give correct `meta`/`isConfigured` and a TODO body.
- [ ] **`server/social/index.js`:** registry + `getProvider` + `listConfigured()`.
- [ ] **Test `social-foundation.test.js`:** (1) encrypt→decrypt round-trips; decrypt of tampered string throws. (2) SocialAccount.toClient() omits token fields. (3) registry has all 5 platforms; `isConfigured()` is false with no env, true when env set (set + delete process.env in the test). (4) ScheduledPost validates target status enum.
- [ ] Run → PASS. Full suite no regressions. **Commit** `feat: social distribution foundation — models, token crypto, provider registry [#7 T1]`

---

## Task 2: OAuth connect/callback + accounts routes
**Files:** Create `server/routes/social.js`; Modify `server/index.js` (mount `/api/social`); Test `server/test/social-oauth.test.js`.

- [ ] `socialRouter` (requireAuth + resolveWorkspace except the callback, which is stateless via signed state):
  - `GET /api/social/providers` → list of `{ key, label, configured }` from `listConfigured()`.
  - `GET /api/social/:platform/connect` → 400 if unknown, 503 `{error:'<platform> not configured'}` if `!isConfigured()`; else build signed `state` (JWT: `{ workspaceId, platform, userId, exp }`) and return `{ url: provider.getAuthUrl({ redirectUri, state }) }`.
  - `GET /api/social/:platform/callback?code&state` → verify state (bad/expired → 400); `provider.exchangeCode` (injectable via `req.app.locals.socialProviders` for tests); upsert SocialAccount (encrypt tokens); redirect to `${clientUrl}/?social=connected&platform=...` (or return JSON in test).
  - `GET /api/social/accounts` → workspace's accounts via `toClient()`.
  - `DELETE /api/social/accounts/:id` → delete (workspace-scoped; 404 if not in this workspace).
- [ ] Tests inject a fake provider set via `req.app.locals.socialProviders`. Cover: providers list reflects configured; connect returns a url with state; connect on unconfigured → 503; callback with valid state upserts an account (and tokens are stored encrypted, not plaintext — assert the stored field !== raw token); callback bad state → 400; accounts list is workspace-scoped; delete works + cross-workspace delete 404.
- [ ] Run → PASS, full suite green. **Commit** `feat: social OAuth connect/callback + account management routes [#7 T2]`

---

## Task 3: scheduling routes + BullMQ delayed-job publisher worker
**Files:** Modify `server/routes/social.js` (post routes), `server/worker/index.js` (register social queue) ; Create `server/worker/processSocialPublish.js`, `server/utils/socialQueue.js`; Test `server/test/social-scheduling.test.js`.

- [ ] `POST /api/social/posts` { videoUrl, title, caption, perPlatformCaption?, targets:[platform...], scheduledAt }: validate scheduledAt is future, each target platform configured + has a connected account in this workspace (else 400/422 listing the bad targets). Create ScheduledPost (targets resolved to socialAccountId, status 'pending'); enqueue a delayed job (`delay = scheduledAt - now`) on `socialPublishQueue` (injectable via `req.app.locals.socialPublishQueue`); store jobId. 202 with the post.
- [ ] `GET /api/social/posts` → workspace's posts (newest first). `DELETE /api/social/posts/:id` → cancel: remove the BullMQ job if pending, set status 'canceled' (only if not already processing/completed).
- [ ] `server/worker/processSocialPublish.js`: given a postId, load post; for each target: load SocialAccount, decrypt tokens, refresh if `expiresAt` passed (provider.refresh, persist new tokens), `provider.publishVideo`, set target status posted/failed + externalId/postUrl/error. Aggregate post.status (completed/partial/failed). Idempotent-ish: skip targets already 'posted'.
- [ ] Wire the queue+worker in `server/worker/index.js` (mirror the generation queue setup; lockDuration generous for uploads).
- [ ] Tests (hermetic, no real Redis/Stripe): call `processSocialPublish` directly with injected fake providers + a seeded post & account; assert targets transition to posted and post.status becomes completed; a throwing provider → that target failed + post.status partial; expired token triggers refresh. Route tests inject a fake queue (assert add() called with the right delay) and validate target/account checks.
- [ ] Run → PASS, full suite green. **Commit** `feat: schedule + publish social posts via delayed-job worker [#7 T3]`

---

## Task 4: the 5 platform adapters (real API wiring, env-gated)
**Files:** Implement `server/social/providers/{youtube,tiktok,meta,twitter,linkedin}.js`.

- [ ] Implement each adapter's real OAuth + publish per the platform API (YouTube Data API v3 resumable upload; TikTok Content Posting API; Meta Graph video/Reels publish; X media upload + tweet; LinkedIn UGC/video). Read creds from `config.social.platforms[x]`. Keep `isConfigured()` gating so missing creds never call the network. Use `fetch` (Node 20+ global) — no new heavy deps unless necessary (YouTube may warrant `googleapis`, but prefer raw REST to stay light; document any dep added).
- [ ] Each adapter: small unit test of `getAuthUrl` (correct base + scopes + state in the query) and `isConfigured()` toggling on env. (Live publish can't be unit-tested without creds — guarded; add a clear comment + a `// LIVE-VERIFY` note.)
- [ ] Full suite green. **Commit** `feat: implement YouTube/TikTok/Meta/X/LinkedIn social adapters (env-gated) [#7 T4]`

---

## Task 5: client UI — connect accounts, compose & schedule, status
**Files:** Modify `src/lib/api.js` (social namespace); Create `src/components/social/DistributionPanel.jsx`; integrate into `src/components/ResultsScreen.jsx` (a "Publish" action on generated videos + a Distribution section) and/or the account modal.

- [ ] `api.js` `social` namespace: `providers()`, `connect(platform)`, `accounts()`, `disconnect(id)`, `createPost(data)`, `posts()`, `cancelPost(id)`.
- [ ] `DistributionPanel`: (a) **Connect accounts** — a row per platform showing configured/connected state; "Connect" opens `connect(platform).url` (popup or redirect); platforms not configured show "Setup required" (disabled) with a tooltip. (b) **Schedule a post** — pick a generated video (from the current series' done video assets, by S3 url), caption (+ optional per-platform tweak), choose target platforms (only connected ones selectable), date-time picker, "Schedule". (c) **Scheduled/posted list** — status per platform, cancel pending.
- [ ] Surface a `?social=connected` return (after OAuth redirect) → refresh accounts + toast.
- [ ] Match the existing aesthetic (inline styles, CSS vars, JetBrains Mono/Cinzel). `npm run build` green. **Commit** `feat(ui): social distribution panel — connect, schedule, track posts [#7 T5]`

---

## Task 6: verification + review + env example + merge
- [ ] Add the `SOCIAL_*` placeholders to `server/.env.server.example` (committable) with comments on where to get each platform's creds + the redirect URI to register. (Do NOT touch the gitignored `.env.server`.)
- [ ] `cd server && npm test` green; `npm run build` green.
- [ ] Security review of token crypto + OAuth state + token-leak surfaces (read-only agent).
- [ ] Update memory; push branch; open PR to main; merge.

---

## Self-Review (planning)
**Coverage:** connect (OAuth, T2), schedule (T3), publish (T3 worker + T4 adapters), UI (T5), all 5 platforms (T4), env-gated readiness (T1 isConfigured throughout). 
**Security:** tokens encrypted at rest + never sent to client (toClient), OAuth state signed/expiring, routes workspace-scoped. 
**Deferred:** BYO-video upload-to-S3 step (v1 uses an existing asset URL); analytics on posted content; per-platform format validation/transcoding; reels-vs-feed nuances; rate-limit/quotas handling beyond basic error capture. 
**Risk:** live posting can't be verified without real dev-app creds (by user's choice) — adapters are structured + unit-tested for auth-url/config, with LIVE-VERIFY notes; the engine (schedule→fire→publish dispatch→status) IS fully testable with injected fakes.
**Plan gating question (flagged, not blocking):** should scheduling be a paid-plan feature? Left open to the workspace for v1 (any logged-in workspace can schedule); easy to gate later via planFeatures.
