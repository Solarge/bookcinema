# Design — Sub-project #1: Server-Side Managed Generation Pipeline

**Date:** 2026-06-02
**Status:** Approved (design); pending implementation plan
**Scope:** First sub-project of the larger "Managed SaaS, full commercial readiness" effort.

---

## 1. Context & background

BookFilm Studio currently generates everything **client-side** with the user's own API keys: the LLM script, character images, scene videos, and dialogue voice all run in the browser, proxied through Vite path-prefixes (`/anthropic`, `/openai`, …) so the browser never holds keys on a third-party origin. The Express + MongoDB server is optional and never touches a generation — it only stores saved series, assets, accounts, teams, and analytics.

The chosen commercial direction is a **Managed SaaS**: the platform holds the provider keys, generation runs on the platform's servers, and usage is billed (credits/subscriptions). This is the keystone sub-project — nothing commercial (credit metering, plan enforcement, billing) can be enforced until generation runs on platform infrastructure.

This document specifies **only** the managed generation pipeline plus the workspace-tenancy foundation it requires. Credit ledger (#2), plan/feature enforcement (#3), billing (#4), team seat billing (#5), and legal/compliance (#6) are **out of scope** and specified separately.

### Decisions locked during brainstorming
- **Surface area:** managed (server-side) generation for **text, image, and voice**. **Video stays on the existing client BYO-key path** and gets its own later sub-project (long-running async case).
- **Execution model:** **async job queue** (Redis-backed BullMQ) for all three types.
- **Worker topology:** **separate worker service** (dedicated container), API and worker share one `server/` codebase with two entrypoints.
- **Provider choice:** **curated few per type, surfaced as quality tiers.** Local/self-hosted providers (Ollama, ComfyUI, A1111, Kokoro, XTTS) are dropped from managed mode.
- **Spend guardrail (interim, until #2/#4):** **beta allowlist + hard per-tenant daily caps** enforced in middleware, plus a global kill-switch.
- **Tenant boundary:** **Workspace is the tenant.** An individual is a personal workspace of one; an organization is the same entity with many members. Built now, including re-scoping existing `Series`/`Assets` to `workspaceId`.

### Success criteria
- An allowlisted workspace can request text/image/voice generation through the platform's keys, poll for results, and receive them (text inline; image/voice as S3 URLs).
- Generation cost is recorded per workspace in `UsageLog`.
- Per-workspace daily caps, max-concurrency, and a global kill-switch demonstrably prevent unbounded provider spend.
- All resources (`Series`, `Asset`, `Job`, `UsageLog`, quotas) are scoped by `workspaceId`; existing data is backfilled into personal workspaces.
- The existing BYO-key client path (and all video) continues to work unchanged.

### Non-goals
- No credits, no payments, no plan-based feature gating (later sub-projects).
- No managed video generation.
- No physical/per-tenant database isolation (logical row-scoping only).
- No white-label/agency nested tenancy (the Workspace model is designed to allow it later, but it is not built here).

---

## 2. Architecture & data flow

```
Browser (managed mode)
  │  POST /api/generate/{text|image|voice}  { params, tier }   (+ X-Workspace-Id header)
  ▼
API (Express)  — requireAuth → resolveWorkspace → managedAccess → validate
  │  create Job(Mongo, status=queued) → enqueue(BullMQ) → 202 { jobId }
  ▼
Redis (BullMQ queue)  ◄───────────────────────────────────────┐
  ▼                                                             │ status reads
Worker service (separate container)                             │
  │  resolve curated provider by (type, tier)                   │
  │  → call provider API with PLATFORM key                      │
  │  → upload asset to S3 (image/voice)                         │
  │  → write UsageLog(workspaceId, cost, provider, success)     │
  │  → update Job(status=done|failed, result, costUsd)          │
  └─────────────────────────────────────────────────────────────┘
  ▲
Browser  ── GET /api/jobs/:id (poll ~2s) → { status, result, error, costUsd }
           render when status=done: { text } for script, { url } (S3) for image/voice
```

- **Two deployables, one codebase.** `node index.js` (API) and `node worker/index.js` (worker) both import shared generation code from `server/generation/`. The worker runs as a new compose service using the same image, env, network, and Redis.
- **Provider adapters are ported, not reused.** Client modules call relative proxy paths so the browser holds no keys. Server adapters in `server/generation/providers/` call provider APIs **directly with keys from server env**. The client BYO-key modules remain untouched (used by `byok` mode and by video).
- **Job state lives in two places by purpose.** BullMQ/Redis owns live execution (retries, concurrency, stalled-job recovery). A Mongo `Job` record owns history, ownership, audit, and is what the status endpoint reads (survives Redis eviction).
- **Video is entirely excluded** — it stays on the client BYO-key path regardless of mode.

---

## 3. Workspace tenancy (foundation)

### Workspace entity (promote the existing `Team` model)
Fields: `name`, `type` (`'personal' | 'organization'`), `ownerId`, `members: [{ userId, role: 'owner'|'admin'|'member' }]`, `plan`, `managedBeta: Boolean`, `createdAt`. (Billing and white-label fields are added in #4/#6.)

- **On registration**, auto-create a `personal` workspace with the user as sole `owner`; set `User.defaultWorkspaceId`. Solo users never see the term "workspace" — it is invisible plumbing.
- **`Workspace.members` is the source of truth** for membership. `User.teamId` is replaced by membership lookup + `User.defaultWorkspaceId`.

### Active-workspace context
- New middleware `resolveWorkspace` runs after `requireAuth`: reads the target workspace from an `X-Workspace-Id` header (falling back to the user's default), **verifies the user is a member**, and attaches `req.workspace` + `req.membership.role`. Non-members → `403`.
- Helper `requireWorkspaceRole('owner'|'admin')` for workspace-admin actions (used heavily in later sub-projects).

### Scoping (revision to all resources)
- `Job`, `UsageLog`, and the Redis quota key all key on **`workspaceId`** (`quota:{workspaceId}:{YYYYMMDD}`), with `createdBy: userId` retained for attribution.
- **Beta allowlist is on the workspace** (`Workspace.managedBeta`), not the user — gating which *tenants* may spend platform money.
- Existing `Series` and `Asset` gain `workspaceId`; their queries switch from `userId`/`teamId` filters to `workspaceId` (preserving `createdBy`).

### Migration
A one-shot, idempotent backfill script: for each existing user without a workspace, create a personal workspace and set `defaultWorkspaceId`; stamp that user's existing `Series`/`Asset` rows with the new `workspaceId`. Safe to run on an empty database (no-op) and re-runnable.

---

## 4. API surface

All endpoints require `requireAuth` + `resolveWorkspace`. Generate endpoints additionally pass `managedAccess`.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/generate/text` | `{ bookText, genrePreset, language, tier }` | `202 { jobId }` |
| POST | `/api/generate/image` | `{ prompt, aspectRatio, tier, characterReferenceUrl? }` | `202 { jobId }` |
| POST | `/api/generate/voice` | `{ text, voiceId, tier }` | `202 { jobId }` |
| GET | `/api/jobs/:id` | — | `{ id, type, status, result, error, costUsd }` |
| GET | `/api/jobs?limit=` | — | recent jobs for the active workspace |
| GET | `/api/workspaces` | — | workspaces the user is a member of |
| POST | `/api/workspaces/switch` | `{ workspaceId }` | sets/returns active workspace |
| GET | `/api/workspaces/:id/members` | — | members (workspace member only) |

- `status ∈ queued | active | done | failed`.
- `result` = `{ text }` for text; `{ url }` (S3) for image/voice.
- Job ownership is enforced by `workspaceId` match; cross-workspace access → `404`.

---

## 5. Generation module (`server/generation/`, shared by API + worker)

- **`registry.js`** — the curated tier map, the heart of managed mode:
  ```
  MANAGED_PROVIDERS = {
    text:  { standard: { provider, model, estCostUsd }, premium: { ... } },
    image: { standard: { ... }, premium: { ... } },
    voice: { standard: { ... }, premium: { ... } },
  }
  ```
  Exact provider↔tier assignments are a tuning detail settled during implementation; the *structure* (tier → provider + model + cost estimate) is fixed.
- **`providers/{anthropic,openai,falai,replicate,elevenlabs,...}.js`** — server adapters making direct API calls with platform keys. Each exposes a uniform per-type signature mirroring the existing client provider contracts.
- **`resolve.js`** — `(type, tier) → { adapter, metadata }`; throws on unknown type/tier.
- **Key management:** platform keys loaded in `config.js` as `config.providerKeys.{...}` from server env. Unlike the existing hard-required vars (which throw on boot), a *missing managed provider key disables only that tier*, not server startup. Production hardening (secrets manager) noted for later, not built here.

---

## 6. Cost guardrails (interim safety net)

`managedAccess` middleware, applied to all `/api/generate/*`:
1. `403` if `!req.workspace.managedBeta` (allowlist gate).
2. `429` if `quota:{workspaceId}:{today}` for that type ≥ env cap (`MANAGED_CAP_TEXT_DAILY`, `_IMAGE_`, `_VOICE_`).
3. `429` if the workspace's in-flight (`queued`+`active`) job count ≥ `MANAGED_MAX_CONCURRENT`.

- **Global kill-switch:** `MANAGED_GENERATION_ENABLED=false` → all generate endpoints return `503` immediately.
- **Quota is reserved on enqueue, released on terminal failure**, so a workspace cannot exhaust its cap via failing jobs nor dodge it by spamming submits.
- The worker records actual `costUsd` to `UsageLog`; the existing admin stats aggregation surfaces it.

---

## 7. Error handling

| Condition | Response |
|---|---|
| Invalid body / unknown tier | `400` |
| Workspace not a member's | `403` |
| Not on managed allowlist | `403` |
| Daily cap or concurrency exceeded | `429` |
| Job not found / wrong workspace | `404` |
| Kill-switch off | `503` |

- **Provider/S3 failure in worker:** BullMQ retry, 2 attempts, exponential backoff. Final failure → `Job.status=failed` with a **sanitized** error message (never leak keys or raw upstream bodies), release reserved quota, write `UsageLog{ success:false }`.
- **Worker crash mid-job:** BullMQ stalled-job recovery re-queues; idempotent S3 keys mean a retry overwrites rather than duplicates.
- Failed generations consume neither cap nor (future) credits.

---

## 8. Client integration (`src/`)

- **`src/lib/api.js`** gains a `managed` namespace: `generateText/Image/Voice(params)`, `getJob(id)`, and a `pollJob(id, { intervalMs, onUpdate })` helper. Every request sends the `X-Workspace-Id` header. New `workspaces` namespace (list/switch/members).
- **`AuthContext`** loads the user's workspaces + active workspace on boot.
- **`SettingsContext`** gains `mode: 'byok' | 'managed'` (managed shown only to allowlisted workspaces during beta; default behavior finalized with billing in #4).
- **`generateSeries()`** (`textProviders/index.js`) and **`MediaContext`** branch on `mode`: **managed** → submit job + poll, mapping results into the existing per-asset states (`generating/done/error`); **byok** → existing client path, unchanged. **Video always uses byok.**
- The existing per-asset status UI works unchanged — managed mode simply feeds it from polling instead of direct calls.

---

## 9. Testing

The server currently has **no test runner**; this sub-project adds one (`node:test`, no new dependency, fits the ESM setup). TDD per the project's normal flow.

- **Unit:** `resolve.js` tier resolution; each provider adapter against a mocked provider HTTP client (fixtures, never live paid APIs); `managedAccess` allowlist/quota/concurrency math; `resolveWorkspace` membership checks; each worker processor with mocked provider + mocked S3.
- **Integration:** enqueue → process (Redis test instance or BullMQ in-memory) → `GET /api/jobs/:id` returns the result; allowlist → `403`; over-cap → `429`; kill-switch → `503`; failed job releases quota; cross-workspace job access → `404`.
- **Migration:** backfill script tested against a seeded DB and against an empty DB (no-op).

---

## 10. Deployment

- **`docker-compose.yml`:** add a `worker` service — same image as `server`, command `node worker/index.js`, same `env_file`, network, and `depends_on: redis`. Scale via `docker compose up --scale worker=N`.
- **New env** in `server/.env.server.example`: platform provider keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `FALAI_KEY`, `ELEVENLABS_KEY`, …), `MANAGED_GENERATION_ENABLED`, `MANAGED_CAP_*_DAILY`, `MANAGED_MAX_CONCURRENT`.
- No new external infrastructure — reuses existing Redis, MongoDB, and S3.

---

## 11. Sequencing note

This sub-project intentionally ships **without** credits or billing. The beta allowlist + daily caps + kill-switch are the interim controls that make it safe to run managed generation on platform-funded keys for a controlled set of workspaces until the credit ledger (#2) and billing (#4) land. Those sub-projects build directly on the `workspaceId`-scoped `Job`/`UsageLog`/quota foundation established here.
