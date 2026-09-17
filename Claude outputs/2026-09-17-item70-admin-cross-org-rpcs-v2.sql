-- Item 70 -- 5 missing admin_cross_org_<table>() RPCs, 2026-09-17
--
-- Confirmed live 2026-09-15/17: augur_deals, eventus_events, assets,
-- crm_activities, and prospectus_leads still carry the ORIGINAL Super Admin
-- RLS bypass (bare, unfiltered SELECT as Super Admin returns every org's
-- rows blended together) -- unlike campaigns/programmes/tasks/templates/
-- partners/campaign_partner_allocations/audit_log, which already went
-- through this exact same fix in 2026-09-10-super-admin-rls-v5-cross-org-
-- security-definer-rpcs.sql. This is that same migration's pattern, applied
-- to the 5 tables it didn't cover.
--
-- Mirrors v5 EXACTLY: one SECURITY DEFINER function per table, gated on
-- platform_admin_level() IS NOT NULL (checked once per call, not once per
-- row the way a second permissive RLS policy would be -- that's what caused
-- the original Cursus boot-timeout v3/v4 were built to fix), returning
-- SETOF public.<table> so it can't drift from the table's real columns.
-- p_org_id NULL = all organizations, matching orgScoped()'s existing
-- null-means-unfiltered convention. Safe to run any time; every function is
-- CREATE OR REPLACE, and this only adds new capability -- it doesn't touch
-- any existing policy, function, or data.
--
-- Requires 2026-09-07-item38-platform-admin-l1-migration.sql
-- (platform_admin_level()) already in place, same as v5.
--
-- NOTE: this closes the *reporting/admin-RPC* side of the gap (Reportus.html
-- and any other module wanting deliberate cross-org reads on these 5 tables
-- now has a safe, audited way to get them). It does NOT drop the underlying
-- bypass policy on these 5 tables the way v7 does for the other ~42 -- that
-- is a separate, larger migration (see item 73) and shouldn't be bundled in
-- here blind.

CREATE OR REPLACE FUNCTION public.admin_cross_org_augur_deals(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.augur_deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_augur_deals: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.augur_deals
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_eventus_events(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.eventus_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_eventus_events: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.eventus_events
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_assets(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_assets: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.assets
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_crm_activities(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.crm_activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_crm_activities: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.crm_activities
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_prospectus_leads(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.prospectus_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_prospectus_leads: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.prospectus_leads
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cross_org_augur_deals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_eventus_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_assets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_crm_activities(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_prospectus_leads(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICATION -- run as yourself (a real Super Admin) in Supabase's SQL editor:
SELECT proname FROM pg_proc WHERE proname IN (
  'admin_cross_org_augur_deals','admin_cross_org_eventus_events','admin_cross_org_assets',
  'admin_cross_org_crm_activities','admin_cross_org_prospectus_leads'
) ORDER BY proname;
-- Should list all 5.

-- ---------------------------------------------------------------------------
-- ROLLBACK -- if you ever want to remove these:
-- DROP FUNCTION IF EXISTS public.admin_cross_org_augur_deals(uuid);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_eventus_events(uuid);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_assets(uuid);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_crm_activities(uuid);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_prospectus_leads(uuid);
