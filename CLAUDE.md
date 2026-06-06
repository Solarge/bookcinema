# Project Instructions

## Autonomy
- You have full permission to proceed on all tasks without asking for approval
- Do not ask "shall I proceed?", "would you like me to?", or "is that okay?"
- Make decisions, execute them, and report what you did
- If you encounter multiple approaches, pick the best one and proceed
- Only pause if something is genuinely blocked (missing credential, ambiguous requirement with no logical default)

## Permissions
- Read, create, edit, and delete files freely
- Run terminal commands without asking first
- Install packages as needed
- Make code changes across the codebase without confirmation
- Do not ask for permission before running bash commands, editing files, or installing packages

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**BookFilm Studio** — a PWA that turns any book (pasted text or uploaded PDF) into a complete 7-episode cinematic AI video production package: characters, episodes, scenes, dialogue, plus generated images/video/voice for each. The frontend works fully standalone (BYO API keys in Settings); the Express server is an optional backend for accounts, teams, cloud asset storage, and analytics.

Despite the `socialmedia` directory name, `package.json` name is `bookfilm-temp` and the product is BookFilm Studio.

## Commands

Frontend (run from repo root):
- `npm run dev` — Vite dev server (port 5173) with the API proxies
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the built `dist/`
- `npm run lint` — ESLint over the whole repo

Backend (run from `server/`):
- `npm start` — `node index.js` (port 3001)
- `npm run dev` — `node --watch index.js` (auto-restart)

Full stack via Docker (from root): `docker compose up` — builds the server (`Dockerfile.server`) and a hardened local Redis. The server reads `server/.env.server`.

There is **no test suite** and no TypeScript — this is a plain JS (ESM) React 19 + Vite 8 project. Use `npm run lint` to validate frontend changes.

## Architecture

### Two independent halves
1. **Frontend SPA** (`src/`) — does the actual book→series generation and media generation entirely client-side by calling AI provider APIs directly (through Vite/proxy paths). Persists work locally (localStorage + IndexedDB). Needs no backend to function.
2. **Express API** (`server/`) — optional. MongoDB + JWT auth, S3 asset storage, Redis, teams, analytics, admin. The frontend only talks to it when `VITE_USE_AUTH=true` / `VITE_API_URL` is set.

`supabase/` contains empty scaffolding (functions + migrations dirs are empty) — it is **not** the active backend. The `@supabase/supabase-js` and `@stripe/stripe-js` deps are likewise unused/aspirational. Ignore Supabase unless explicitly asked to build it out.

### The provider registry pattern (most important concept)
All external AI work goes through pluggable provider registries. To add/change a model, you edit a registry map and drop a module implementing the agreed function signature — nothing else needs to know.

- **Text** (`src/utils/textProviders/index.js`): `TEXT_PROVIDERS` maps key → `{ fn, label, tier, free, badge }`. Each provider module exports `generateSeries(bookText, genrePresetKey, providerSettings, language)`. `generateSeries()` is the single entry point the app calls; it picks the provider from `settings.textProvider`. Providers: anthropic, groq, deepseek, gemini, ollama.
- **Media** (`src/utils/mediaProviders/index.js`): three registries — `IMAGE_PROVIDERS`, `VIDEO_PROVIDERS`, `VOICE_PROVIDERS` — with `getImageProvider/getVideoProvider/getVoiceProvider(name)` lookups. Provider modules live in `imageProviders/`, `videoProviders/`, `voiceProviders/` subdirs. Image fns take `{ prompt, aspectRatio, imageQuality, apiKey, ... }`; video fns take `{ prompt, duration, ... }`; voice fns take `{ text, voiceId, apiKey, ... }` and return `{ audioBlob, audioUrl }`.

Provider keys in the registry do **not** always match the API-key storage key. `MediaContext` remaps them before lookup (e.g. registry `fal.ai` → key `falai`, `openaitts` → `openai`). When adding a provider, check both the registry key and the `getApiKey(...)` remap.

### The generation prompt
`src/utils/textProviders/systemPrompt.js` defines the exact JSON schema the LLM must return (title/author/logline → characters[] → episodes[] → scenes[] with per-provider prompts like `midjourney_prompt`, `kling_prompt`, `elevenlabs_voice`). The whole UI (`ResultsScreen`, `StoryboardView`, `MediaContext`) is shaped by this schema — changing the schema means changing the prompt **and** the consumers.

### Frontend state — three React contexts (`src/contexts/`)
- `SettingsContext` — provider choices, API keys, quality/aspect settings, white-label. Persisted via `utils/settings.js`. Source of truth for which provider/model/key everything uses.
- `MediaContext` — orchestrates all image/video/voice generation for one series (keyed by `seriesSlug`). Holds per-asset status (`idle/generating/done/error`), approval state, cost tracking, and `generateBatch()`. Wraps only the results screen. Stores generated bytes locally via `utils/assetStore.js` (IndexedDB) and tracks spend via `utils/costTracker.js`.
- `AuthContext` — backend session only. Refreshes JWT from an httpOnly cookie on mount; broadcasts `auth:logout` (dispatched by `src/lib/api.js` on a failed 401 refresh). App is gated by `AuthGate` only when `VITE_USE_AUTH==='true'`.

`App.jsx` is a manual page router (`home | loading | results | library`) via `useState` — there is no router library.

### Backend API (`server/`)
Standard Express layering: `routes/` → `models/` (Mongoose) → `utils/` (jwt, s3, redis, email). `index.js` wires helmet/cors/cookie-parser then mounts `/api/{auth,series,assets,teams,users,share,analytics,admin}` plus `/health`. `config.js` loads `.env.server` and **throws on missing required vars** (MONGODB_URI, JWT secrets, all AWS_* vars) — the server will not boot without them. Auth is dual-token: short-lived access JWT in memory + refresh token in an httpOnly cookie. `src/lib/api.js` is the matching client (auto-refresh on 401, typed namespaces: `auth`, `series`, `assets`, `teams`, `users`, `analytics`, `admin`).

### Dev proxies (`vite.config.js`)
Every cloud AI API and every local self-hosted tool is proxied through a path prefix (`/anthropic`, `/openai`, `/local-ollama`, `/local-comfyui`, etc.) with `changeOrigin` + prefix rewrite, so the browser never makes cross-origin calls in dev and keys aren't exposed to third-party origins via referrer. Provider modules call these relative paths. If you add a provider hitting a new host, add its proxy entry to `CLOUD_PROXIES` or `LOCAL_PROXIES`.

## Conventions
- ESM everywhere (`"type": "module"` in both package.jsons). No TypeScript.
- Provider tiers: `cloud` (needs API key) vs `local` (self-hosted, free, no key — e.g. ollama, comfyui, a1111, kokoro, xtts, localvideo). Code frequently special-cases the no-key local providers.
- "BYO key, client-side" is the default mode. Don't route generation through the server unless the task is specifically about the authenticated/cloud-storage backend.
- Styling is inline styles + CSS variables (`--bg`, `--gold`, `--muted`, etc.) and Tailwind v4 via `@tailwindcss/vite`; white-label theming overrides `--gold` and the document title at runtime.
