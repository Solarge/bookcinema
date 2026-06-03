# 1B — Managed Generation Module + Queue (text slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the server-side managed-generation foundation — platform-held provider keys, a curated tier→provider **registry**, a `resolve(type, tier)` lookup, server-side **text** generation adapters (Groq + Anthropic), the server-owned prompt builder, and the Redis/BullMQ **queue** wiring — so the platform can generate a series script on its own keys. Image/voice adapters and the worker/API/client are explicitly later slices.

**Architecture:** A new `server/generation/` module (shared by API + worker), plus `server/queue/`. The registry maps `(type, tier) → { provider, model, adapter, estCostUsd }` using the **cost-first** tiers: text standard=Groq / premium=Anthropic. Adapters call provider APIs **directly with platform keys from `config.providerKeys`** and return the parsed series JSON. The BullMQ queue (`generation`) is wired now; the worker that consumes it is **1C**.

**Tech Stack:** Node ESM, Express, Mongoose, **BullMQ** (new dep) on Redis, `node:test` + `mongodb-memory-server` + `supertest`. Provider HTTP via global `fetch` (Node 18+). Tiers per the approved spec `docs/superpowers/specs/2026-06-02-managed-generation-pipeline-design.md`.

**Infra to run/verify (you provision):** `REDIS_URL` (local: `docker compose up -d redis` → `redis://:CHANGE_THIS_REDIS_PASSWORD@localhost:6379`) and `GROQ_API_KEY` (free at console.groq.com). `ANTHROPIC_API_KEY` optional (premium text). **Unit tests mock the providers and need no infra; only live end-to-end verification needs the key + Redis.**

**Scope boundary:** NO image/voice adapters (next slice 1B-media — needs S3 + media keys), NO worker (1C), NO `/api/generate` endpoints or `managedAccess` guardrails (1D), NO client managed-mode (1E). This slice is unit-testable in full without infra; the queue enqueue test uses a mocked queue.

---

## File Structure

**Create:**
- `server/generation/systemPrompt.js` — server copy of the prompt builder (ported from `src/utils/textProviders/systemPrompt.js`).
- `server/generation/presets.js` — minimal genre-preset additions used by the prompt (ported subset of `src/utils/genrePresets.js`).
- `server/generation/lang.js` — `buildLanguagePromptInstruction(langCode)` (ported subset of `src/utils/languageConfig.js`).
- `server/generation/providers/groqText.js` — server-side Groq text adapter.
- `server/generation/providers/anthropicText.js` — server-side Anthropic text adapter.
- `server/generation/registry.js` — `MANAGED_PROVIDERS` tier map.
- `server/generation/resolve.js` — `resolve(type, tier)`.
- `server/queue/generationQueue.js` — BullMQ queue + `addGenerationJob`.
- `server/test/generation-resolve.test.js`, `server/test/generation-text-adapters.test.js`, `server/test/generation-queue.test.js`.

**Modify:**
- `server/config.js` — add `config.providerKeys` from env (missing keys do NOT throw at boot).
- `server/package.json` — add `bullmq` dependency.
- `server/.env.server.example` — document the new provider-key + REDIS_URL vars.

---

## Task 1: providerKeys config

**Files:** Modify `server/config.js`; Test `server/test/config-providerkeys.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/config-providerkeys.test.js`:

```js
import './helpers/env.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../config.js'

test('config exposes providerKeys without throwing when keys are absent', () => {
  assert.ok(config.providerKeys, 'providerKeys present')
  // env.js sets none of these → all undefined, but the object exists and boot did not throw
  assert.equal('groq' in config.providerKeys, true)
  assert.equal('anthropic' in config.providerKeys, true)
})
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd server && node --test test/config-providerkeys.test.js`
Expected: FAIL (`config.providerKeys` undefined).

- [ ] **Step 3: Add providerKeys to config.js**

In `server/config.js`, add inside the exported `config` object (after the `redis` block):

```js
  // Managed-generation provider keys (platform-held). Missing keys disable only
  // the affected tier — they do NOT block server boot (unlike the required() vars).
  providerKeys: {
    groq:       process.env.GROQ_API_KEY        || null,
    anthropic:  process.env.ANTHROPIC_API_KEY   || null,
    replicate:  process.env.REPLICATE_API_TOKEN || null,
    falai:      process.env.FALAI_KEY           || null,
    openai:     process.env.OPENAI_API_KEY      || null,
    elevenlabs: process.env.ELEVENLABS_KEY      || null,
  },
```

- [ ] **Step 4: Run, verify PASS**

Run: `cd server && node --test test/config-providerkeys.test.js` → PASS.

- [ ] **Step 5: Document env + commit**

Append to `server/.env.server.example`:

```
# ── Managed generation (platform-held provider keys; 1B+) ────────
GROQ_API_KEY=
ANTHROPIC_API_KEY=
REPLICATE_API_TOKEN=
FALAI_KEY=
OPENAI_API_KEY=
ELEVENLABS_KEY=
```

```bash
git add server/config.js server/.env.server.example server/test/config-providerkeys.test.js
git commit -m "feat: add config.providerKeys for managed generation"
```

---

## Task 2: Port the prompt builder (systemPrompt + presets + lang)

**Files:** Create `server/generation/presets.js`, `server/generation/lang.js`, `server/generation/systemPrompt.js`; Test `server/test/generation-prompt.test.js`

> **Porting note for the implementer:** Read `src/utils/textProviders/systemPrompt.js` (the `BASE` template + `buildSystemPrompt`), `src/utils/genrePresets.js` (the `claudeAddition`/`systemAddition`/`fluxStyle`/`klingStyle` fields per preset), and `src/utils/languageConfig.js` (`buildLanguagePromptInstruction`). Port the **text-relevant** pieces server-side. The server must produce the SAME system prompt the client did, so generation output keeps the schema the UI expects.

- [ ] **Step 1: Write the failing test**

Create `server/test/generation-prompt.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSystemPrompt } from '../generation/systemPrompt.js'

test('buildSystemPrompt returns the JSON-schema instruction and respects genre + language', () => {
  const p = buildSystemPrompt('cinematic', 'en')
  assert.match(p, /valid JSON object only/i)
  assert.match(p, /"characters"/)
  assert.match(p, /"episodes"/)
  // a known preset addition appears
  assert.ok(p.length > 500)
  // language instruction included for non-en
  const fr = buildSystemPrompt('cinematic', 'fr')
  assert.notEqual(p, fr)
})
```

- [ ] **Step 2: Run, verify FAIL** (`Cannot find module '../generation/systemPrompt.js'`).

- [ ] **Step 3: Create `server/generation/presets.js`**

Port the preset map from `src/utils/genrePresets.js`. Include at minimum every preset key the client supports, each with `claudeAddition` and `systemAddition` strings (the text-prompt fields). Provide a `getPreset(key)` that falls back to `cinematic`. Copy the actual string values from the client file verbatim so output matches. Example shape (fill with the real values read from the client file):

```js
const PRESETS = {
  cinematic: { claudeAddition: '<copy from client>', systemAddition: '<copy from client>' },
  // ...all other presets the client defines, copied verbatim...
}
export function getPreset(key = 'cinematic') { return PRESETS[key] || PRESETS.cinematic }
```

- [ ] **Step 4: Create `server/generation/lang.js`**

Port `buildLanguagePromptInstruction(langCode)` from `src/utils/languageConfig.js` verbatim (it returns '' for 'en' and a language directive otherwise).

- [ ] **Step 5: Create `server/generation/systemPrompt.js`**

Port the `BASE` template string verbatim from the client `systemPrompt.js`, and:

```js
import { getPreset } from './presets.js'
import { buildLanguagePromptInstruction } from './lang.js'

const BASE = `<copy the exact BASE template from src/utils/textProviders/systemPrompt.js>`

export function buildSystemPrompt(genrePresetKey = 'cinematic', langCode = 'en') {
  const preset = getPreset(genrePresetKey)
  const langInstruction = buildLanguagePromptInstruction(langCode)
  return `${BASE}\n\nSTYLE INSTRUCTIONS:\n${preset.claudeAddition}\n${preset.systemAddition}${langInstruction}`
}
```

- [ ] **Step 6: Run, verify PASS**, then commit:

```bash
git add server/generation/presets.js server/generation/lang.js server/generation/systemPrompt.js server/test/generation-prompt.test.js
git commit -m "feat: port system-prompt builder to server/generation"
```

---

## Task 3: Server text adapters (Groq + Anthropic)

**Files:** Create `server/generation/providers/groqText.js`, `server/generation/providers/anthropicText.js`; Test `server/test/generation-text-adapters.test.js`

Each adapter exports `async function generate({ bookText, genrePreset, language })` and returns the parsed series JSON. It reads its key from `config.providerKeys` and calls the provider API **directly** (no proxy). Tests mock `globalThis.fetch`.

- [ ] **Step 1: Write the failing test**

Create `server/test/generation-text-adapters.test.js`:

```js
import './helpers/env.js'
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

function mockFetchOnce(jsonBody, ok = true, status = 200) {
  globalThis.fetch = async () => ({ ok, status, json: async () => jsonBody, text: async () => JSON.stringify(jsonBody) })
}

test('groqText.generate parses the chat-completion JSON content into a series object', async () => {
  process.env.GROQ_API_KEY = 'test-key'
  const { generate } = await import('../generation/providers/groqText.js?case=1')
  mockFetchOnce({ choices: [{ message: { content: JSON.stringify({ title: 'T', characters: [], episodes: [] }) } }] })
  const series = await generate({ bookText: 'a book', genrePreset: 'cinematic', language: 'en' })
  assert.equal(series.title, 'T')
})

test('groqText.generate throws a clear error when the key is missing', async () => {
  delete process.env.GROQ_API_KEY
  const { generate } = await import('../generation/providers/groqText.js?case=2')
  await assert.rejects(() => generate({ bookText: 'x', genrePreset: 'cinematic', language: 'en' }), /Groq/)
})

test('anthropicText.generate parses the messages API content into a series object', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  const { generate } = await import('../generation/providers/anthropicText.js?case=1')
  mockFetchOnce({ content: [{ text: JSON.stringify({ title: 'A', characters: [], episodes: [] }) }], stop_reason: 'end_turn' })
  const series = await generate({ bookText: 'a book', genrePreset: 'cinematic', language: 'en' })
  assert.equal(series.title, 'A')
})
```

> Note: the `?case=N` query on the import path defeats ESM module caching so each test re-reads `config.providerKeys` via a fresh import. If the adapter reads `process.env` directly (recommended) instead of the cached `config`, the query string is unnecessary — prefer reading `config.providerKeys.groq` but re-evaluate per call (read inside `generate`, not at module top).

- [ ] **Step 2: Run, verify FAIL** (modules don't exist).

- [ ] **Step 3: Create `server/generation/providers/groqText.js`**

```js
import { config } from '../../config.js'
import { buildSystemPrompt } from '../systemPrompt.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export async function generate({ bookText, genrePreset = 'cinematic', language = 'en', model = DEFAULT_MODEL }) {
  const apiKey = config.providerKeys.groq || process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('Groq is not configured (GROQ_API_KEY missing)')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: 8000, temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(genrePreset, language) },
        { role: 'user', content: `Here is the book to transform into a cinematic series:\n\n${bookText}` },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Groq API error ${res.status}`)
  }
  const data = await res.json()
  return parseJson(data.choices?.[0]?.message?.content)
}

function parseJson(raw) {
  const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) } catch (e) { throw new Error(`Groq response parse error: ${e.message}`) }
}
```

- [ ] **Step 4: Create `server/generation/providers/anthropicText.js`**

```js
import { config } from '../../config.js'
import { buildSystemPrompt } from '../systemPrompt.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

export async function generate({ bookText, genrePreset = 'cinematic', language = 'en', model = DEFAULT_MODEL }) {
  const apiKey = config.providerKeys.anthropic || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic is not configured (ANTHROPIC_API_KEY missing)')

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: 16000,
      system: buildSystemPrompt(genrePreset, language),
      messages: [{ role: 'user', content: `Here is the book to transform into a cinematic series:\n\n${bookText}` }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Anthropic API error ${res.status}`)
  }
  const data = await res.json()
  return parseJson(data.content?.[0]?.text, data.stop_reason)
}

function parseJson(raw, stopReason) {
  const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) }
  catch (e) {
    if (stopReason === 'max_tokens') throw new Error('Response cut off — try a shorter book.')
    throw new Error(`Anthropic response parse error: ${e.message}`)
  }
}
```

> The test reads `process.env` fallback, so adapters check `config.providerKeys.x || process.env.X` — keep that order so tests can toggle the key via `process.env`.

- [ ] **Step 5: Run, verify PASS**, then commit:

```bash
git add server/generation/providers/groqText.js server/generation/providers/anthropicText.js server/test/generation-text-adapters.test.js
git commit -m "feat: server-side Groq + Anthropic text generation adapters"
```

---

## Task 4: Registry + resolve

**Files:** Create `server/generation/registry.js`, `server/generation/resolve.js`; Test `server/test/generation-resolve.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/generation-resolve.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from '../generation/resolve.js'

test('resolve returns the cost-first text adapters per tier', async () => {
  const std = resolve('text', 'standard')
  assert.equal(std.provider, 'groq')
  assert.equal(typeof std.adapter.generate, 'function')
  const prem = resolve('text', 'premium')
  assert.equal(prem.provider, 'anthropic')
})

test('resolve throws on unknown type/tier', () => {
  assert.throws(() => resolve('text', 'ultra'))
  assert.throws(() => resolve('hologram', 'standard'))
})
```

- [ ] **Step 2: Run, verify FAIL**.

- [ ] **Step 3: Create `server/generation/registry.js`**

```js
import * as groqText from './providers/groqText.js'
import * as anthropicText from './providers/anthropicText.js'

// Cost-first curated tiers. Image/voice tiers are added in the 1B-media slice.
export const MANAGED_PROVIDERS = {
  text: {
    standard: { provider: 'groq',      adapter: groqText,      model: 'llama-3.3-70b-versatile', estCostUsd: 0 },
    premium:  { provider: 'anthropic', adapter: anthropicText, model: 'claude-sonnet-4-20250514', estCostUsd: 0.03 },
  },
  // image: { standard: {...replicate}, premium: {...falai} },   // 1B-media
  // voice: { standard: {...openaitts}, premium: {...elevenlabs} }, // 1B-media
}
```

- [ ] **Step 4: Create `server/generation/resolve.js`**

```js
import { MANAGED_PROVIDERS } from './registry.js'

export function resolve(type, tier) {
  const tiers = MANAGED_PROVIDERS[type]
  if (!tiers) throw new Error(`Unknown generation type: ${type}`)
  const entry = tiers[tier]
  if (!entry) throw new Error(`Unknown tier '${tier}' for type '${type}'`)
  return entry
}
```

- [ ] **Step 5: Run, verify PASS**, then commit:

```bash
git add server/generation/registry.js server/generation/resolve.js server/test/generation-resolve.test.js
git commit -m "feat: managed-provider registry + resolve (cost-first text tiers)"
```

---

## Task 5: BullMQ generation queue wiring

**Files:** Modify `server/package.json`; Create `server/queue/generationQueue.js`; Test `server/test/generation-queue.test.js`

- [ ] **Step 1: Add bullmq dependency**

In `server/package.json` dependencies add `"bullmq": "^5.34.0"`, then run `cd server && npm install`.

- [ ] **Step 2: Write the failing test** (mock BullMQ so it needs no Redis)

Create `server/test/generation-queue.test.js`:

```js
import './helpers/env.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('addGenerationJob enqueues a job with the expected name + payload', async () => {
  // Inject a fake queue to avoid needing Redis in unit tests.
  const calls = []
  const fakeQueue = { add: async (name, data, opts) => { calls.push({ name, data, opts }); return { id: 'job1' } } }
  const { addGenerationJob } = await import('../queue/generationQueue.js')
  const job = await addGenerationJob({ type: 'text', tier: 'standard', payload: { bookText: 'x' }, workspaceId: 'w1' }, fakeQueue)
  assert.equal(job.id, 'job1')
  assert.equal(calls[0].name, 'generate')
  assert.equal(calls[0].data.type, 'text')
  assert.equal(calls[0].data.workspaceId, 'w1')
})
```

- [ ] **Step 3: Create `server/queue/generationQueue.js`**

```js
import { Queue } from 'bullmq'
import { config } from '../config.js'

export const GENERATION_QUEUE = 'generation'

// Lazily create the real queue only when Redis is configured. Returns null otherwise.
let _queue = null
export function getGenerationQueue() {
  if (_queue) return _queue
  if (!config.redis.url) return null
  const url = new URL(config.redis.url)
  _queue = new Queue(GENERATION_QUEUE, {
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      tls: config.redis.url.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: null, // required by BullMQ
    },
  })
  return _queue
}

// queueOverride lets tests inject a fake queue (no Redis needed).
export async function addGenerationJob({ type, tier, payload, workspaceId, createdBy }, queueOverride) {
  const queue = queueOverride || getGenerationQueue()
  if (!queue) throw new Error('Generation queue unavailable (REDIS_URL not set)')
  return queue.add('generate', { type, tier, payload, workspaceId, createdBy }, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  })
}
```

- [ ] **Step 4: Run, verify PASS** (`cd server && node --test test/generation-queue.test.js`).

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/package-lock.json server/queue/generationQueue.js server/test/generation-queue.test.js
git commit -m "feat: BullMQ generation queue wiring (Redis-optional, test-injectable)"
```

---

## Task 6: Full verification + (optional) live smoke

- [ ] **Step 1: Full server suite** — `cd server && npm test` → all pass (existing 46 + the new generation tests).
- [ ] **Step 2 (optional, needs infra): live text smoke.** With `GROQ_API_KEY` set, run a one-off script that calls `resolve('text','standard').adapter.generate({ bookText: 'A short fable about a fox.', genrePreset: 'cinematic', language: 'en' })` and asserts the result has `.title`, `.characters`, `.episodes`. (This confirms the real Groq path; skip if no key yet.)
- [ ] **Step 3: Push** the branch.

---

## Self-Review (planning)

**Spec coverage (the generation-module portions of the 1B design):** registry/resolve ✓ (Tasks 4), server provider adapters (text) ✓ (Task 3), server-owned prompt ✓ (Task 2), config.providerKeys with "missing key disables tier, not boot" ✓ (Task 1), BullMQ queue wiring ✓ (Task 5).

**Deferred to later slices (explicitly):** image/voice adapters + their tiers (1B-media; needs S3 + fal.ai/Replicate/OpenAI/ElevenLabs keys), the worker that consumes the queue (1C), `/api/generate/*` + `managedAccess` allowlist/caps/kill-switch (1D), client managed-mode + job polling (1E).

**Placeholders:** Task 2 instructs copying real preset/BASE strings verbatim from named client files — the implementer must paste the actual values (not leave `<copy ...>`); this is the one place requiring a read-then-copy rather than fixed code, because the prompt text is large and lives in the client today.

**Infra reality:** every task's unit tests pass with mocked providers/queue and need NO infra. Live verification (Task 6 Step 2) needs `GROQ_API_KEY`; the queue running end-to-end needs `REDIS_URL` (consumed by the 1C worker).
