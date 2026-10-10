# Send test email to me — direct from North's Supabase (no Hub)  · 2026-10-10

**What changed:** `flow-test-send` now emails you itself through an email provider's web API. Hub, `FLOW_DISPATCH_SECRET` and "Bad signature" are no longer involved in the test. Recipient is still only your own login email; subject `[TEST] …`; same email within a minute sends once; max 10 per person per hour.

## Why a provider is needed
Supabase has no "send email" call for functions, and Edge Functions cannot open SMTP ports. So one email provider account (free tiers exist) is required. Supported: **Resend** (simplest), SendGrid, Postmark, Brevo. I cannot create accounts or handle keys — those steps are yours.

## Steps (about 10 minutes, once)
1. **Provider account** (e.g. resend.com) → verify a sending domain (or use the provider's test sender for a first try) → create an API key.
2. **Supabase (North project) → Edge Functions → flow-test-send → Code**: replace with `supabase/functions/flow-test-send/index.ts` from the repo → Deploy.
3. **flow-test-send → Settings**: turn **Verify JWT with legacy secret = OFF** (the function checks your login itself). Do the same for **flow-runner** — it is currently ON and blocks the scheduled-flow cron (needs OFF).
4. **Edge Functions → Secrets** (type these in Supabase, not in chat):
   - `EMAIL_PROVIDER` = `resend` (or sendgrid / postmark / brevo)
   - `EMAIL_API_KEY` = the key
   - `EMAIL_FROM` = `North <notifications@your-verified-domain.com>`
   - `EMAIL_REPLY_TO` = optional
5. Process Maps → a flow → Simulate → **Send test email to me**.

## Check without sending
Open `https://<project>.supabase.co/functions/v1/flow-test-send` (GET) → shows `version: direct-2026-10-10`, `providerReady`, `fromSet`. Both must be `true`.

## Known limits
- Provider request shapes follow public docs and are **not live-tested** — the first send is the first real check; errors show the provider's message.
- One platform-level sender (not per organisation yet). A Configuration card per organisation (voice-provider pattern) is the natural next step if wanted.
- Real flow runs still send through Hub via flow-runner (needs the `FLOW_DISPATCH_SECRET` values in Supabase and Vercel to match, or a later change to send from North too).

## Roll back
`git checkout pre-direct-test-send-2026-10-10 -- supabase/functions/flow-test-send/index.ts ProcessMaps.html`; originals also in `archive/2026-10-10-pre-direct-test-send-*`.
