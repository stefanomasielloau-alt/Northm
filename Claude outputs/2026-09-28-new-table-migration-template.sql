-- !!! DO NOT RUN THIS FILE AS-IS -- it is a copy-paste TEMPLATE. <table_name> is a placeholder.
-- !!! Copy it into a new migration, replace <table_name> and the columns, then run that.
-- 2026-09-28 -- STANDARD TEMPLATE for any North migration that creates a table
-- Mandatory from Supabase's Oct 30 2026 change: new public tables get NO Data API access
-- unless granted explicitly (Supabase revokes postgres's default privileges for
-- anon/authenticated/service_role). Without the GRANTs, North's fail-soft loaders
-- (e.g. Ordo) will silently show EMPTY rather than error.
--
-- Rules:
--   * authenticated  -> required (every North page is signed-in)
--   * service_role   -> required (widget-webhook Edge Function, Hub-Backend sync.py)
--   * anon           -> NEVER (North has no logged-out data access)
--   * RLS + org_isolation policy -> always, same shape as region_gate_rates/custom_widgets
-- Replace <table_name> and columns. Keep everything else.

BEGIN;

CREATE TABLE IF NOT EXISTS public.<table_name> (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- ... columns ...
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY <table_name>_org_isolation ON public.<table_name>
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- Data API access (Oct 30 2026 requirement)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table_name> TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table_name> TO service_role;
-- If the table has a serial/identity column (not uuid), also:
-- GRANT USAGE, SELECT ON SEQUENCE public.<table_name>_id_seq TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
