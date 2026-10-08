-- 2026-10-08 -- CRM / finance / advertising connectors, run from North (per-organisation credentials)
-- Run ONCE in Supabase SQL Editor, then deploy the Edge Function "connectors" (see 2026-10-08-connectors-setup.md).
-- Idempotent: safe to re-run. Replaces the Hub-Backend connector engine (connectors.py + Vercel env variables).
--
-- connector_apps         each organisation's NON-secret settings per connector (client id, region, ...) and the definition
--                        of any custom connector it added.
-- connector_app_secrets  client secret / developer token / API key, AES-256-GCM encrypted by the function.
-- connector_tokens       the sign-in tokens each connection receives, encrypted by the function.
-- All three: RLS on, NO policies, NO grants to the browser roles -- only the "connectors" Edge Function (service role)
-- can read or write them, after checking the caller's role has the Configuration permission. Nothing here is readable
-- from the browser, not even by a signed-in admin.
-- Oct 30 2026 Supabase change: explicit service_role GRANTs are included. Before Oct 30 new tables are still granted to
-- anon/authenticated by default, so those are explicitly REVOKEd as well (RLS would deny them anyway).

BEGIN;

CREATE TABLE IF NOT EXISTS public.connector_apps (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider   text NOT NULL,                           -- hubspot, salesforce, ... or custom_<slug>
  kind       text NOT NULL DEFAULT 'builtin',         -- builtin | custom
  name       text NOT NULL DEFAULT '',
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb,
  def        jsonb,                                   -- custom connectors only
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, provider)
);

CREATE TABLE IF NOT EXISTS public.connector_app_secrets (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider   text NOT NULL,
  payload    text NOT NULL,                           -- v1:<iv>:<ciphertext>
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, provider)
);

CREATE TABLE IF NOT EXISTS public.connector_tokens (
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        text NOT NULL,
  data_enc        text,                               -- v1:<iv>:<ciphertext>; NULL = disconnected
  connected_by    uuid,
  connected_at    timestamptz,
  disconnected_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, provider)
);

ALTER TABLE public.connector_apps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_app_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_tokens      ENABLE ROW LEVEL SECURITY;
-- intentionally NO policies on any of the three.

REVOKE ALL ON public.connector_apps, public.connector_app_secrets, public.connector_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connector_apps        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connector_app_secrets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connector_tokens      TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Quick check afterwards (3 rows, rowsecurity = true):
--   select tablename, rowsecurity from pg_tables where tablename in ('connector_apps','connector_app_secrets','connector_tokens');
