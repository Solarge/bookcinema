# Ops / Production Setup Guide

Step-by-step for the operator config that can't be done in code (it needs your accounts, domain, and DNS). All keys live in `server/.env.server` (gitignored). Restart the server after changing them.

---

## 1. Stripe Tax (charge VAT/GST correctly)
The code already sends `automatic_tax: { enabled: true }` + collects billing address on checkout — but Stripe only applies tax once **Stripe Tax is activated** in your dashboard.
1. Stripe Dashboard → **Settings → Tax** → enable Stripe Tax.
2. Add your **origin address** and register your **tax nexuses** (the regions where you must collect tax).
3. Set your products' tax category (the setup script uses `tax_behavior: 'exclusive'`).
4. (Optional) Dashboard → Settings → Billing → enable **email receipts / invoices** to customers.
No code change needed — once active, checkout will compute and charge tax automatically.

## 2. Stripe webhook (so plan changes actually apply)
A test checkout won't flip the plan unless the webhook reaches your server.
- **Local:** `stripe listen --forward-to localhost:3001/api/billing/webhook` → copy the `whsec_…` into `STRIPE_WEBHOOK_SECRET`, restart.
- **Prod:** Stripe Dashboard → Developers → Webhooks → add endpoint `https://<api-domain>/api/billing/webhook`, subscribe to `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`; put its signing secret in `STRIPE_WEBHOOK_SECRET`.
- Create products + prices: `cd server && node scripts/setup-stripe-products.js` (writes `STRIPE_PRICE_*` into `.env.server`).

## 3. Error tracking (Sentry)
1. Create a project at sentry.io (Node).
2. Copy its **DSN** → `SENTRY_DSN=` in `.env.server`. Restart.
The server + worker auto-initialise Sentry when `SENTRY_DSN` is set (no-op when blank). Set up Sentry **alerts** on new issues + a Slack/PagerDuty integration for on-call.

## 4. Separate admin portal on a subdomain
The admin console is a separate build (`admin.html`). To serve it at `admin.<domain>`:
1. Build: `npm run build` → deploy `dist/admin.html` (+ its `assets/admin-*.js`) at `admin.<domain>` (point the subdomain root at it, or rewrite `/` → admin.html).
2. In `.env.server`:
   - `ADMIN_URL=https://admin.<domain>` (added to the API's CORS allow-list).
   - `COOKIE_DOMAIN=.<domain>` (leading dot) — so the auth cookie is valid across `app.<domain>` and `admin.<domain>`.
3. Ensure `NODE_ENV=production` (cookies become `Secure`) and the API is on `https://`.
Without these, admin login on a different subdomain fails (cookie/CORS). On a single domain (admin at `/admin.html`) you don't need them.

## 5. Transactional email deliverability (DKIM/SPF)
Transactional emails (verify, reset, invite, dunning, low-credit, job-done, welcome) go through Resend (`RESEND_API_KEY`, `EMAIL_FROM`). To stay out of spam:
1. Resend Dashboard → **Domains** → add your sending domain.
2. Add the DNS records Resend gives you at your registrar:
   - **SPF** (TXT) and **DKIM** (CNAME/TXT) records.
   - (Recommended) a **DMARC** TXT record (`v=DMARC1; p=none; rua=mailto:dmarc@<domain>`).
3. Wait for Resend to mark the domain **Verified**, then set `EMAIL_FROM=no-reply@<verified-domain>`.
Until the domain is verified, verification/reset emails will likely land in spam and break signup.

## 6. Provider funding (managed generation)
The platform pays for all AI. Premium image/video need funded provider accounts:
- **fal.ai** → add billing (the worker logged "Exhausted balance").
- **Replicate** → add a payment method (the worker logged the no-payment-method throttle).
- For paid customers, use **paid** Groq/Gemini tiers and flag the free ones `freeOnly: true` in `server/generation/registry.js` (commercial-ToS safety).
Optionally set `MANAGED_DAILY_SPEND_CAP_USD` (platform daily $ kill-switch).

## 7. Required prod env recap
`MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AWS_*`, `REDIS_URL` (+ `REDIS_PASSWORD` in root `.env` for docker), `SOCIAL_TOKEN_KEY` (social), `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*` (billing). Build the frontend with `VITE_API_URL` set. The worker (`npm run worker`) must run alongside the API for managed generation.
