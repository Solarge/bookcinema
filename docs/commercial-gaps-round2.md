# BookFilm Studio — Commercial Gaps Review #2 (post managed-only pivot)

Four grounded audits (unit-economics/billing, liability/legal, tenancy/admin/ops, growth/retention). The managed-only pivot moved cost + liability onto the platform; that reframes the top risks. Severity P0 (blocks/endangers launch) / P1 (important) / P2 (polish). Evidence is `file:line`.

---

## 🔴 THE BIG NEW RISKS (not previously thought about)

### 1. Unit economics — video is likely **margin-negative**, and there's **zero spend visibility**
- Implied price ≈ **$0.04/credit** (from packs/plans). Video costs **20 cr (standard) / 40 cr (premium)** → ~$0.76 / $1.52 revenue. But real provider cost per ~5s clip (Replicate minimax / fal kling / Runway / Luma) is **$0.50–$2.00+**, not the registry's `estCostUsd` $0.20/$0.40. → A Pro ($19) user spending all 500 cr on video can cost **$5–$25**; a Studio ($79) user **$20–$100**; **every credit pack is loss-making** in the video worst case. `server/generation/registry.js`, `src/utils/plans.js`.
- **`Job.costUsd` is always 0** — no adapter records actual provider cost, so the platform has **no real margin/spend visibility** and can't detect a provider price change. `server/models/Job.js:15`, `server/generation/providers/*`.
- **No platform-wide $ spend cap / circuit breaker.** Caps are per-workspace counts only. `config.js`, `managedAccess.js`.
- **Free-tier farming:** once `managedBeta` opens to all, a free signup can cost up to ~$2.50/day in images (50/day × $0.05) for $0 revenue, scriptable across N workspaces. No card-on-file/phone gate. `Workspace.js:26`, `managedAccess.js`.

### 2. Platform liability — managed-only makes the **platform the generator**
- **Content moderation is client-side only** (`src/utils/contentSafety.js`, a shallow regex in the browser) — a direct API call bypasses it entirely. The server enqueues `bookText` with **no moderation** and generates on the **platform's** provider keys → harmful output = platform account bans + legal exposure (incl. CSAM criminal risk). `server/routes/generate.js`. **P0.**
- **DMCA safe-harbor likely inapplicable:** the platform itself creates the derivative work (a 7-episode adaptation) of a copyrighted book on its own keys — not passive hosting. The DMCA page is written for a host model that no longer applies. Copyright "ack" is a client-side localStorage checkbox, not server-enforced. **P0 (needs counsel).**
- **Commercial use of free-tier provider keys:** Groq-free + Gemini-free are the *primary* standard-tier providers — used by all paying customers by default. Free tiers prohibit commercial use → ToS violation, risk of sudden key revocation (text gen goes offline). `registry.js`. **P1.**
- **No subprocessor DPAs / disclosure / SCCs** for ~12 AI subprocessors; privacy policy is DRAFT. GDPR exposure. **P1.**
- **Voice-cloning / likeness:** `voiceId` is unvalidated → a user could clone a real person's voice on the platform's ElevenLabs account (right-of-publicity, ELVIS Act, AI Act). Biography inputs → photorealistic real-person images. **P1.**
- **AI-content labelling** is framed as the *user's* duty, but under the EU AI Act the **deployer (platform)** must label — no C2PA/provenance embedded server-side. **P1.**

### 3. Admin console security (new surface)
- **Default super-admin password `Test123@`** (8 chars, bypasses the 12-char policy) in `scripts/create-admin-user.js`. **P0 — change it.**
- **Admin can promote anyone (incl. self) to `admin` with NO audit log.** No `AdminAuditLog` (actor/target/action/before/after). Credit grants, plan changes, deactivations, role promotions are all unattributed. `routes/admin.js:56`. **P0.**
- **Admin login will break on a `admin.` subdomain:** refresh cookie has no `domain` + `sameSite:'lax'`; CORS only allows one `clientUrl`. `auth.js:219`, `index.js:46`. **P1.**
- **No 2FA for admins; no rate-limiting on admin endpoints.** **P1.**

---

## 🟠 BILLING / REVENUE OPS (P1)
- **Dunning is harsh + silent:** `invoice.payment_failed` → instant hard-downgrade to free, **no grace period, no email**; `past_due` can trigger a *second* downgrade. Involuntary churn. `billing.js:115`.
- **No dunning / low-credit / job-complete / welcome / receipt emails** — only verify/reset/invite exist. `email.js`.
- **Plan upgrade doesn't immediately refill credits** (lazy on next request → possible 402 right after upgrade). `billing.js`, `refill.js`.
- **Downgrade silently zeroes unused monthly credits;** no annual plans; no proration config on plan change; no enterprise/custom tier; no overage/top-up automation.
- **Account deletion doesn't cancel the Stripe subscription** → continued billing after GDPR delete. `users.js:118`.
- **No MRR/churn/subscription metric** in admin stats ("revenue" is actually AI cost). `admin.js`.
- **`automatic_tax` enabled in code but Stripe Tax must be activated** in dashboard or 0% is applied silently.

## 🟠 OPS / RELIABILITY (P1)
- **`/health` is trivial** (`{status:'ok'}`) — no Mongo/Redis checks; orchestrators route to a dead instance. `index.js:77`.
- **No alerting** on worker failures, job backlog, provider failover rate, spend, or payment failures (Sentry optional, not enforced). 
- **Single worker + single Redis = SPOF;** worker has no healthcheck; no DLQ; S3 upload failure loses generated output (refunds but discards the buffer).
- **No CD / staging / deploy step** (CI only lints+tests); no ownership-transfer endpoint → org can be orphaned/deadlocked. `workspaces.js`, `users.js:128`.
- Missing `{status,createdAt}` index for admin job queries at scale.

## 🟠 GROWTH / ACTIVATION / RETENTION (P0–P1)
- **No public landing/pricing page** — everything is behind `AuthGate`; SEO/paid/word-of-mouth all hit a login wall. **P0.**
- **No guided first-run / demo / sample book** → broken activation at step one. **P0.**
- **No trial of paid features / no "wow" before paywall** (voice/video hard-locked for free). **P0.**
- **25 free credits can't show the headline "book→video" loop** (video is Pro-only + 20cr/clip). **P0.**
- **No lifecycle emails** (welcome, job-done, low-credit, dunning, win-back); long video jobs finish with no notification. **P0/P1.**
- **No referral program, no annual discount, no product analytics/funnel** (signup→activation→upgrade→churn). **P1.**
- **Social tokens silently expire** (TikTok 24h, X 2h) — no refresh-before-post / re-connect prompt → scheduled posts fail. **P1.**
- **No mobile-responsive layout** (it's a PWA, so installed mobile users get a broken UI); **support is a placeholder mailto**; no docs/FAQ/status page; white-label doesn't update title/OG. **P1–P2.**

---

## What's fixable in code now (I can do these) vs needs you

**Engineering quick/medium wins (I can build):**
- Record **actual provider cost** on `Job.costUsd` + a platform spend view + a **global $ spend kill-switch**.
- **Re-price video** (raise credits) / gate video to paid + add a free "demo video" credit; show **credit cost + remaining balance** in the generate response + a pre-gen estimate.
- **Server-side moderation hook** (OpenAI Moderation on `bookText` before enqueue) + server-enforced copyright assertion + `bookText` length cap.
- **Admin: AdminAuditLog, self-demotion guard, admin rate-limit, remove default password + require strong one, cookie `domain`/CORS for the admin subdomain.**
- **Dunning grace period + dunning/low-credit/job-done/welcome emails;** cancel Stripe sub on account delete; immediate refill on upgrade; **MRR/subscription metric** in admin.
- **`/health` dependency checks;** BullMQ alerting hooks; worker healthcheck; ownership-transfer endpoint; the missing index.
- **Activation:** sample-book one-click demo, empty-state CTA, post-signup "check your inbox", low-balance nudges.

**Needs you / business decisions:**
- **Lawyer:** real ToS/Privacy/DMCA + DPAs/subprocessor list + the managed-adaptation copyright position + voice/likeness consent.
- **Pricing strategy:** the video margin (re-price vs absorb), annual plans, enterprise tier, free-tier limits.
- **Provider contracts:** move paid users off free-tier Groq/Gemini to commercial tiers.
- **Marketing:** public landing/pricing page content; Stripe Tax activation; email domain DKIM/SPF; product-analytics tool choice; 2FA provider.
