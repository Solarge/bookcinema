# BookFilm Studio — Commercial-Readiness Audit (2026-06-03)

Four parallel code audits (security, billing, operations, product/legal). Severity: **P0** = blocks launch / charging customers, **P1** = important pre-launch, **P2** = polish/hardening. Evidence is `file:line` from the actual codebase.

---

## CRITICAL PATH (P0) — must clear before a public, paid launch

### Legal / compliance (cannot legally launch as-is)
- **Placeholder legal docs.** ToS & Privacy render an amber "DRAFT — not legal advice; replace before launch" banner to users; contact emails are placeholders. `src/components/legal/LegalPages.jsx:22`. → Lawyer-reviewed copy.
- **No DMCA / copyright protection.** The core feature ingests *any* book — most are copyrighted. No DMCA agent/policy (needed for §512 safe harbor), no upload acknowledgement, no content provenance. `server/routes/generate.js`, `src/utils/contentSafety.js`. → DMCA policy + registered agent + a "I have rights to this text" checkbox before first upload.
- **No AI-generated-content disclosure.** Required by EU AI Act Art. 50 and TikTok/YouTube/Instagram policies. No label on-screen or in exported media. → Visible disclosure + embedded metadata/label on exports.
- **No tax/VAT collection.** Checkout has no `automatic_tax`/billing-address collection — illegal to sell to EU/UK/AU without it. `server/routes/billing.js:42`. → `automatic_tax:{enabled:true}` + `billing_address_collection:'required'` + enable Stripe Tax.
- **No cookie consent + Google Fonts leaks IP to Google.** `index.html:11`. → Self-host fonts (cleanest) or add a consent banner.
- **No age gate.** Privacy says "13+" but nothing collects/verifies age while mature content is allowed-with-warning. → DOB/13+ checkbox at signup.

### Money correctness (cannot safely charge)
- **No dunning.** Webhook ignores `invoice.payment_failed` / `past_due` — a failed renewal keeps Pro/Studio indefinitely. `server/routes/billing.js:83`. → Handle failed-payment events → downgrade/grace.
- **Credit refunds go to the wrong bucket.** `refundCredits` always tops up `monthlyCredits` even when `purchasedCredits` was spent. `server/utils/credits.js:22`. → add a `bucket` param (mirror `grantCredits`); also fix the worker refund path.
- **Stripe keys optional at boot, no warning.** Missing keys silently 503 all billing (unlike Mongo/JWT/AWS which hard-fail). `server/config.js:107`. → require (or loudly warn) in production.
- **Admin credit/plan endpoints write dead fields.** `PATCH /admin/users/:id/{credits,plan}` write `User.credits`/`User.plan`, which nothing reads — gating is on `Workspace.*`. `server/routes/admin.js:26,38`. → operate on the user's workspace.

### Security
- **Logout is cosmetic.** Refresh tokens carry no `jti` and `/refresh` never checks the blacklist, so a stolen refresh cookie stays valid ~7 days post-logout (and the blacklist is a no-op without Redis). `server/utils/jwt.js`, `server/routes/auth.js:63`. → add `jti` + check blacklist on refresh; consider rotation.
- **Rate limits bypassable — no `trust proxy`.** Behind any proxy/LB, `express-rate-limit` keys on the proxy IP (limits everyone as one) and `X-Forwarded-For` is spoofable. `server/index.js`. → `app.set('trust proxy', 1)`.
- **No email verification.** Instant account + 25 credits for any typed email → credit farming / squatting (409 also enables enumeration). `server/routes/auth.js:17`. → verify email before managed spend.
- **Generation endpoints have no HTTP rate limit.** `generationLimiter` is defined but never applied; only DB-checked caps protect the paid AI endpoints. `server/middleware/rateLimit.js:21`, `server/routes/generate.js`. → apply it.

### Operations (won't run / operate in prod)
- **Worker missing from docker-compose.** Compose runs only `node index.js`; managed jobs enqueue but nothing dequeues — the primary paid feature never executes in Docker. `docker-compose.yml`. → add a `worker` service.
- **No graceful shutdown.** No SIGTERM handling in server or worker → every deploy drops in-flight requests and stalls jobs. `server/index.js:68`. → `server.close()` / `worker.close()` on SIGTERM.
- **No request logging or error tracking.** Only `console.*`; no morgan/pino, no Sentry → production is blind. `server/index.js`. → morgan + Sentry + `unhandledRejection`/`uncaughtException` handlers.
- **`VITE_API_URL` falls back to `localhost:3001` in the prod bundle.** Any non-local frontend host → all API calls fail. `src/lib/api.js:2`. → require it at build time.

### Product / UX
- **Forgot-password is a no-op in the UI.** Server routes exist but `App.jsx:32` passes `() => {}` — users who forget their password are locked out permanently. → wire a ForgotPassword page.
- **Zero accessibility.** No ARIA anywhere; modals lack `role="dialog"`/focus trap; images have no `alt`. Legal exposure (ADA/EAA) + unusable with a screen reader. → ARIA roles/labels, focus traps, alt text.

---

## IMPORTANT (P1)
- No in-product **pricing/plan comparison** before Stripe redirect; credit-pack dollar amounts not shown (`ProfilePage.jsx:241,270`).
- No **support/contact/help** channel anywhere in-product.
- **No OG/Twitter meta tags** → blank social unfurls (`index.html`).
- **Mobile layout** breaks <768px (fixed-px panels, e.g. SettingsPanel 400px).
- **BYO-mode data-loss footgun** — series/keys only in localStorage/IndexedDB, no warning/export-all.
- **Fake loading progress** — bar stalls at 90%, not tied to real job status; no managed-job progress.
- **No per-account login lockout** (only IP limiter); password policy weak (min 8, no complexity).
- **No DB transaction** around credit debit + ledger write (small inconsistency window); `applyMonthlyRefill` can double-write ledger rows on concurrent first-request.
- **UsageLog missing compound index** `{workspaceId, createdAt}` → analytics are collection scans.
- **External provider fetch calls have no timeout/retry** → a hung provider holds a job lock for 2.5 min.
- Admin user-search **regex unescaped** (ReDoS) `admin.js:16`; `preferences`/`fullOutput` are unvalidated `Mixed` (pollution / unbounded growth).
- **No marketing-consent** field (separate from ToS consent) for future email.
- **`SOCIAL_TOKEN_KEY` not required** → social connect 500s with no boot warning if unset.
- **No CI** (`.github/` absent) — lint/tests don't run on push.

## POLISH (P2)
- Refresh-token rotation; helmet CSP scoping; `nodemailer` CVE upgrade; PNG PWA icons (generator dep already present); manualChunks to split the ~948 KB bundle; React **error boundary**; UI **i18n** (generator is multilingual, UI is English-only); white-label half-done (brand strings hardcoded in index.html/auth pages/manifest); IndexedDB quota/TTL eviction; book-text length limit; Redis `CHANGE_THIS_REDIS_PASSWORD` in source; analytics/providers unbounded date range; subscription checkout missing idempotency key; new-subscriber credit-grant race window.

---

## What's already solid (not gaps)
Webhook idempotency + rollback; atomic credit debit (aggregation pipeline); terminal-only refund (no retry double-refund); tenant isolation on data routes (workspace-scoped, no existence oracle); social token encryption at rest + OAuth state signing + SSRF guard; premium/white-label server-side gating; Stripe secret never exposed client-side.

---

## Recommended sequencing
1. **Engineering quick-wins (cheap, high-impact, I can do now):** trust proxy, apply generation limiter, refund-bucket fix, Stripe required-in-prod + boot warnings, graceful shutdown, request logging + error-handler hardening, VITE_API_URL build guard, forgot-password page, regex escaping, UsageLog index, provider fetch timeouts, worker service in compose, OG tags, alt text, error boundary, CI workflow.
2. **Needs your input / external:** real ToS/Privacy + DMCA (lawyer), Stripe Tax config, email-verification flow (product decision), copyright stance (restrict to owned/public-domain?), a11y pass, pricing page.
3. **Bigger features:** AI-content disclosure on exports, i18n, mobile responsive pass, support channel.
