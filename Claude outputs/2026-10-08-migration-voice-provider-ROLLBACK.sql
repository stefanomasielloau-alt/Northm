-- 2026-10-08 -- ROLLBACK for 2026-10-08-migration-voice-provider.sql
-- WARNING: this drops the organisations' saved voice settings AND their encrypted keys. Keys cannot be recovered
-- afterwards (admins would re-enter them). Ask Alec simply goes back to the browser voice.
-- Run only if you want the feature removed. Then also delete the "voice" Edge Function in the Supabase dashboard.
BEGIN;
DROP TABLE IF EXISTS public.voice_provider_secrets;
DROP TABLE IF EXISTS public.voice_providers;
COMMIT;
NOTIFY pgrst, 'reload schema';
