-- 2026-10-08 -- Organisation voice provider for Ask Alec "read aloud" (North-hosted, Step 3)
-- Run ONCE in Supabase SQL Editor, then deploy the Edge Function "voice" (see 2026-10-08-voice-provider-setup.md).
-- Idempotent: safe to re-run.
--
-- voice_providers         = the visible settings of each organisation's voice provider (no secret in here).
--                           Members of the organisation can READ it (so Ask Alec knows whether to use it).
--                           Nobody can WRITE it from the browser: only the "voice" Edge Function (service role)
--                           writes it, and only after checking the caller has the Configuration permission.
-- voice_provider_secrets  = the encrypted API key / extra headers. RLS on, NO policy, NO grant to authenticated:
--                           the browser can never read it, even a signed-in admin. Only the Edge Function can.
-- Oct 30 2026 Supabase change: explicit GRANTs are included.

BEGIN;

CREATE TABLE IF NOT EXISTS public.voice_providers (
  org_id        uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled       boolean NOT NULL DEFAULT true,
  kind          text NOT NULL,                       -- openai | elevenlabs | azure | google | custom
  label         text NOT NULL DEFAULT '',
  model         text NOT NULL DEFAULT '',
  voice         text NOT NULL DEFAULT '',
  language      text NOT NULL DEFAULT '',
  region        text NOT NULL DEFAULT '',
  base_url      text NOT NULL DEFAULT '',
  auth_style    text NOT NULL DEFAULT 'bearer',
  auth_name     text NOT NULL DEFAULT '',
  auth_prefix   text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  response_kind text NOT NULL DEFAULT 'audio',       -- audio | json_base64
  response_path text NOT NULL DEFAULT '',
  content_type  text NOT NULL DEFAULT 'audio/mpeg',
  header_names  text[] NOT NULL DEFAULT '{}',        -- NAMES of extra headers only (values are encrypted)
  has_key       boolean NOT NULL DEFAULT false,
  encrypted     boolean NOT NULL DEFAULT true,
  updated_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.voice_provider_secrets (
  org_id     uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  payload    text NOT NULL,                          -- v1:<iv>:<ciphertext> (AES-256-GCM)
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_providers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_provider_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voice_providers_org_read ON public.voice_providers;
CREATE POLICY voice_providers_org_read ON public.voice_providers FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));
-- voice_provider_secrets: intentionally NO policy (deny all except service_role, which bypasses RLS).

-- Data API access (Oct 30 2026 requirement)
GRANT SELECT ON public.voice_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_providers        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_provider_secrets TO service_role;
-- (no grant on voice_provider_secrets to authenticated or anon -- on purpose)

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Quick check afterwards (should list both tables, rowsecurity = true):
--   select tablename, rowsecurity from pg_tables where tablename in ('voice_providers','voice_provider_secrets');
