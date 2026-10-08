# Organisation voice for Ask Alec — setup (2026-10-08)

Everything lives in North (same pattern as Zapier keys / widget-api-proxy). Nothing in Hub-Backend, Vercel or per-org Supabase secrets.

## One-time platform install (you, once for all organisations)
1. **Supabase → SQL Editor:** run `2026-10-08-migration-voice-provider.sql` (creates `voice_providers` + `voice_provider_secrets`, RLS and grants).
2. **Supabase → Edge Functions → Deploy a new function → Via Editor:** name it exactly `voice`, paste the contents of `supabase/functions/voice/index.ts`, keep **Verify JWT ON**, Deploy.
3. Nothing else to set. The function derives its own encryption key from the project's built-in service key. (Optional: set a `VOICE_SECRET_KEY` secret later for a separate key — but do it *before* admins save keys, or they must re-enter them.)

## Per organisation (the org admin, no developer)
Configuration → Integrations → **Voice** → pick a provider (OpenAI, ElevenLabs, Azure Speech, Google Cloud TTS, or Custom HTTP API) → fill the fields → paste the API key → Save → **Test voice**. Only roles with the Configuration permission can save; the key is stored encrypted and never shown again (the screen shows "key saved").

Then, in Ask Alec (any module) the 🎙 settings show **Voice source: Organisation voice / This browser’s voice**. If the provider fails, Alec says so and carries on with the browser voice.

## Test-provider sign-up reminder (Stef)
Sign up to any one provider and get an API key: e.g. OpenAI (text-to-speech), ElevenLabs, Microsoft Azure Speech, or Google Cloud Text-to-Speech. Check each provider’s current pricing / free allowance yourself — not verified here. Then use the steps above and press Test voice.

## Limits
- Provider request shapes were built from each provider’s documented API but **not tested against a real account yet**.
- No spend limits or usage metering; each spoken sentence is one provider request.
- Providers that need request signing (e.g. Amazon Polly) are not supported; use the Custom option only for simple key-in-header APIs.
- Private/internal addresses are blocked for custom providers (checked on save and again on each call; the DNS check applies where the runtime allows it).

## Rollback
`2026-10-08-migration-voice-provider-ROLLBACK.sql`, then delete the `voice` function. Ask Alec returns to the browser voice automatically.
