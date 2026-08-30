# BoardBuddy — Cloudflare Workers deploy guide

The app is a TanStack Start (Nitro) app. `bun run build` already emits a
Cloudflare Worker bundle in `dist/` plus `dist/server/wrangler.json`.

---

## 1. Supabase (your own project)

Everything — preview, published site and the Cloudflare Worker — must point at
**one and the same Supabase project**.

1. Create the project in your own Supabase account.
2. Open **SQL Editor** and run, in this order:
   - `supabase/FULL_SETUP.sql` (tables, RLS, grants, RPCs, owner role)
   - `supabase/PLANS_FEATURE_PARITY.sql` (plan catalogue + feature lines)
   - `supabase/FIX_EMAIL_CONFIRM.sql`
   - `supabase/GRAND_TEST_RANK.sql` (rank + percentile RPC used by Exam Hub)

3. **Authentication → Sign In / Providers → Email**: turn **Confirm email OFF**.
   Accounts use a synthetic address `<username>@boardbuddy.app`, which can never
   receive a confirmation mail.
4. Copy from **Project Settings → API**: Project URL, project id, the
   *publishable/anon* key, and the *service role* key.

## 2. Variables to add in Cloudflare

Workers & Pages → your project → **Settings → Variables and Secrets**.

### Build-time (plain text — inlined into the browser bundle)

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-id>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable / anon key |
| `VITE_SUPABASE_PROJECT_ID` | `<project-id>` |

### Runtime (plain text)

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | same as `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | same as `VITE_SUPABASE_PUBLISHABLE_KEY` |

### Runtime **secrets** (encrypted — never plain text)

| Secret | Needed for |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | server functions, webhook writes (alias `APP_SUPABASE_SERVICE_ROLE_KEY` also works) |
| `RAZORPAY_KEY_ID` | Razorpay order creation (optional — can be set in Owner Panel → Keys instead) |
| `RAZORPAY_KEY_SECRET` | Razorpay signature verification (same, optional) |
| `RAZORPAY_WEBHOOK_SECRET` | verifying `POST /api/public/razorpay-webhook` |
| `LOVABLE_API_KEY` | built-in AI tutor. Not present on Cloudflare — so on Cloudflare you must set your own AI provider + key in **Owner Panel → AI** (OpenAI / Groq / OpenRouter etc.), otherwise the tutor is disabled |
| `LOVABLE_CRON_SECRET` | only if you call the cron endpoints |

Razorpay keys and the AI key can also be saved from the Owner Panel — they are
stored in the private `secure_settings` table and take priority over host env
values only when the env value is missing.

## 3. Build settings

| Field | Value |
| --- | --- |
| Build command | `bun install && bun run build` |
| Deploy command | `npx wrangler deploy` |
| Output directory | `dist` |
| Compatibility flags | `nodejs_compat` |
| Compatibility date | `2025-01-01` or newer |

## 4. Razorpay webhook

In the Razorpay dashboard add a webhook pointing to:

```
https://<your-worker-domain>/api/public/razorpay-webhook
```

Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`.
Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`.

## 5. After the first deploy

1. Sign in as the owner account, open **Owner Panel**.
2. **Owner → Keys** — paste the Razorpay key id/secret (if not set as secrets).
3. **Owner → AI** — pick provider, paste key, press *Test key*.
4. **Owner → Support** — set the support Gmail (default
   `swastikbaniyabhai@gmail.com`), the direct call number and the WhatsApp
   number. Email is shown to every paying student; the phone and WhatsApp are
   shown only to **Max Pro**.
5. **Owner → Plans** — check the feature lines. A student unlocks **exactly**
   the lines written on the plan card, nothing more.

## 6. Support policy built into the app

| Student | Support |
| --- | --- |
| Free | No support desk (self-help only). Payment-failure screen shows no support CTA. |
| Any paid plan | Email support on the owner's Gmail. |
| Max Pro | Direct contact — phone call, WhatsApp and Gmail. |
