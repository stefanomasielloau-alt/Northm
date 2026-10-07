-- 2026-10-06 -- API keys for external pollers (first use: Zapier integration, Stef: "set up so when
-- we have code, we can move ahead just like I asked you with all the other connectors").
-- Run standalone; idempotent; safe to run more than once.
--
-- Why this exists: every other connector in Hub-Backend is North reaching OUT to a third-party OAuth
-- app. Zapier is the reverse shape -- a third party (Zapier, acting for Stef) needs to reach IN to
-- North. North has no "give an outside caller a durable credential" mechanism yet; this is that
-- mechanism, generically named (api_keys, not zapier_keys) so any future reversed integration reuses
-- it rather than getting its own one-off token table.
--
-- Same storage pattern as flow-inbound's inbound_token_hash: the raw key is shown ONCE at creation
-- (by the zapier-keygen Edge Function) and only its hash is ever stored -- a stolen row from this
-- table can't be used to authenticate.

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Zapier',
  key_hash text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON public.api_keys (key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS api_keys_org_idx ON public.api_keys (org_id) WHERE revoked_at IS NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Standard org isolation (same shape as every other new-table template in this project) -- lets an
-- org's own users SEE their keys' labels/created_at/last_used_at in a future admin UI. key_hash is a
-- one-way SHA-256 hash, not the raw key, so exposing it to the org's own authenticated members isn't
-- a secret-leak the way exposing the raw key would be.
DROP POLICY IF EXISTS api_keys_org_isolation ON public.api_keys;
CREATE POLICY api_keys_org_isolation ON public.api_keys
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- INSERT deliberately NOT granted to `authenticated` -- a client-side insert could put any org_id in
-- the row. Keys are only ever minted by the zapier-keygen Edge Function (service role, org_id taken
-- from the caller's verified JWT, never from client input). Revoking/rotating later can reuse the same
-- pattern (a second Edge Function, or an UPDATE-only grant) -- not built this pass, flagged in the
-- setup checklist doc alongside this migration.
GRANT SELECT ON public.api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
