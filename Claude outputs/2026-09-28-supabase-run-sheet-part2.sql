-- =====================================================================================
-- 2026-09-28 -- NORTH SUPABASE RUN SHEET, PART 2 (project rcmocuubeajnqjltuwdv -- NORTH)
-- New features from the 28 Sep build: pod-level overrides, naming table, custom fields,
-- and the 2 campaigns with no activity. Run AFTER part 1. Each step separately; check EXPECT.
-- All new tables follow the 30 Oct grant rule (authenticated + service_role, never anon).
-- Everything is additive except step 2, which archives the old values first.
-- Prepared by Claude, NOT run by Claude.
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 1 -- POD-LEVEL RATE + STREAM-MIX OVERRIDES (new tables; mirror region_gate_rates/region_streams)
-- EXPECT: check returns pod_gate_rates | true | true and pod_streams | true | true
-- ─────────────────────────────────────────────────────────────────────────────────────
BEGIN;
CREATE TABLE IF NOT EXISTS public.pod_gate_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  pod_id      UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  gate_id     UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  rate        NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pod_id, gate_id)
);
CREATE INDEX IF NOT EXISTS pod_gate_rates_pod_idx ON public.pod_gate_rates (pod_id);
ALTER TABLE public.pod_gate_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pod_gate_rates_org_isolation ON public.pod_gate_rates;
CREATE POLICY pod_gate_rates_org_isolation ON public.pod_gate_rates
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pod_gate_rates TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.pod_streams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  pod_id      UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  stream_id   UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  mix         NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pod_id, stream_id)
);
CREATE INDEX IF NOT EXISTS pod_streams_pod_idx ON public.pod_streams (pod_id);
ALTER TABLE public.pod_streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pod_streams_org_isolation ON public.pod_streams;
CREATE POLICY pod_streams_org_isolation ON public.pod_streams
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pod_streams TO authenticated, service_role;
REVOKE ALL ON public.pod_gate_rates, public.pod_streams FROM anon;
COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT c.relname, c.relrowsecurity AS rls_on, has_table_privilege('authenticated', c.oid, 'insert') AS app_can_write
FROM pg_class c WHERE c.relname IN ('pod_gate_rates','pod_streams') AND c.relnamespace='public'::regnamespace;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 2 -- CAMPAIGNS WITH NO ACTIVITY ("Denn campaign", "RLS TEST CAMPAIGN")
-- Points each campaign that has no activity at its own organisation's "Unassigned" activity, so it
-- stops falling out of activity roll-ups. Old values archived first (they were all NULL).
-- Skips any org that has no Unassigned activity (nothing to point at).
-- EXPECT: first check lists the campaigns fixed; second returns 0.
-- ─────────────────────────────────────────────────────────────────────────────────────
BEGIN;
CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS archive."2026_09_28_campaigns_null_activity" AS
  SELECT id, org_id, name, activity_id, now() AS archived_at FROM campaigns WHERE false;
INSERT INTO archive."2026_09_28_campaigns_null_activity"
  SELECT id, org_id, name, activity_id, now() FROM campaigns WHERE activity_id IS NULL;
UPDATE campaigns c
   SET activity_id = u.id
  FROM (SELECT DISTINCT ON (org_id) org_id, id FROM activities WHERE unassigned ORDER BY org_id, id) u
 WHERE c.activity_id IS NULL AND u.org_id = c.org_id;
COMMIT;
SELECT a.name AS campaign, a.org_id, c.activity_id AS now_points_at
  FROM archive."2026_09_28_campaigns_null_activity" a JOIN campaigns c ON c.id=a.id;
SELECT count(*) AS still_no_activity_expect_0 FROM campaigns WHERE activity_id IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 3 -- NAMING TABLE + CUSTOM FIELD DEFINITIONS (2 additive columns on org_settings)
-- EXPECT: check returns 2.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS naming_config jsonb;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS custom_fields_config jsonb;
NOTIFY pgrst, 'reload schema';
SELECT count(*) AS cols_expect_2 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='org_settings' AND column_name IN ('naming_config','custom_fields_config');


-- ─────────────────────────────────────────────────────────────────────────────────────
-- STEP 4 -- CUSTOM FIELD VALUES (1 additive column on campaigns)
-- EXPECT: check returns 1.
-- ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
NOTIFY pgrst, 'reload schema';
SELECT count(*) AS col_expect_1 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='campaigns' AND column_name='custom_fields';
