# Step 3 — organisation's own voice for Ask Alec (status, 2026-10-08)

All in **North** (Supabase table + Edge Function + Configuration card). Hub-Backend untouched. Org admins set it up themselves; no per-org Vercel/Supabase secrets.

## How it works
| Piece | Where | Role |
|---|---|---|
| Configuration → Integrations → **Voice** card | `Configuration.html` | Admin picks provider (OpenAI, ElevenLabs, Azure Speech, Google Cloud TTS, Custom HTTP API), fills model/voice/region/address, pastes key, Save, **Test voice**. Needs the Configuration permission. Key is write-only (never shown back). |
| `voice_providers`, `voice_provider_secrets` | Supabase (SQL migration) | Settings (members can read) and AES-256-GCM encrypted key (no browser access at all). |
| `voice` Edge Function | `supabase/functions/voice/index.ts` | Checks the caller, admin check for save/remove, decrypts the key, calls the provider server-side, returns audio. SSRF guards on custom addresses. |
| Ask Alec read-aloud | `shared/alecReview.js` | Uses the org voice by default when set up and enabled; prefetches next sentence; per-person switch back to the browser voice; if the provider fails Alec says why and continues with the browser voice. |

## One-time install (you, platform owner)
1. Supabase SQL Editor → run `Claude outputs/2026-10-08-migration-voice-provider.sql` (rollback file alongside).
2. Edge Functions → new function named `voice` → paste `supabase/functions/voice/index.ts` → Verify JWT ON → Deploy.
3. Hard refresh North. Details: `Claude outputs/2026-10-08-voice-provider-setup.md`.

## REMINDER (you asked for this): sign up to a test provider
The fields are in place. Sign up to one provider (OpenAI TTS, ElevenLabs, Azure Speech or Google Cloud TTS — check current pricing/free allowance yourself, not verified), then Configuration → Integrations → Voice → Save → Test voice, then open Ask Alec in any module → 🎙 → confirm "Organisation voice" is selected → Read aloud.

## Tested vs not
- **Tested here (headless, fakes):** core function logic (72 checks: validation, SSRF guards, encryption round-trip, request building per provider, response parsing, secret merge), TypeScript typecheck 0 errors; Configuration card (21 checks incl. function-not-deployed / table-missing messages, key never shown back, controls disabled without permission); Ask Alec org voice (14 checks: detection, POST shape, token + apikey, prefetch with no duplicates, browser/org switch, failure → message + browser fallback, disabled / no key / missing table ignored); earlier review/read-aloud suites still pass (30 + hand-off).
- **NOT tested (cannot from here):** any real provider account (request shapes follow each provider's documented API but are unverified), the Edge Function on real Supabase/Deno (DNS check applies only where Deno allows), real browser audio playback, real roles/RLS in your project.
- **Known limits:** no spend limits or usage metering (one request per spoken sentence); providers needing request signing (e.g. Amazon Polly) unsupported; one voice provider per organisation.

## Files
| Path (Northm) | Purpose |
|---|---|
| `supabase/functions/voice/index.ts` (new) | Edge Function: speak / test / save / remove. |
| `Claude outputs/2026-10-08-migration-voice-provider.sql` (new) | Tables, RLS, grants. |
| `Claude outputs/2026-10-08-migration-voice-provider-ROLLBACK.sql` (new) | Drops both tables. |
| `Claude outputs/2026-10-08-voice-provider-setup.md` (new) | Install + admin steps. |
| `Configuration.html` (modified) | Voice card. Backup: `archive/2026-10-08-pre-voice-Configuration.html`. |
| `shared/alecReview.js` (modified) | Org voice client wiring. Backup: `archive/2026-10-08-pre-orgvoice-alecReview.js`. |
