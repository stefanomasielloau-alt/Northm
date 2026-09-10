-- Item 68 -- v5: SECURITY DEFINER RPCs for real cross-org reads on the 7 tables rolled
-- back by v3/v4, 2026-09-10
--
-- Context: v3/v4 (already run) dropped the Super Admin RLS bypass policy from audit_log,
-- programmes, campaigns, tasks, templates, partners and campaign_partner_allocations --
-- the working hypothesis at the time was that a second PERMISSIVE policy on these tables
-- (`... OR is_platform_admin() OR platform_admin_level() IS NOT NULL`) was defeating the
-- query planner's ability to use existing indexes, causing Cursus's Super Admin boot to
-- blow its statement timeout. That fixed the timeout, but as v4's own comment said up
-- front: it also meant "All organizations" / a specific other org silently stopped being
-- able to show real cross-org data on these 7 tables -- RLS just quietly filters an
-- unfiltered SELECT down to the caller's own org, no error, no warning.
--
-- Stef, 2026-09-10, live-testing again: "I cant switch to All Organisations .. seems
-- stuck to My Organisation... seems to revert to My org." That symptom is consistent with
-- exactly this trade-off, now surfaced through bootApp()'s new auto-recovery retry
-- (SAV.resetToOwn(), shipped earlier today): when one of these 7 reads comes back
-- catches that and silently reverts the view to "My organization" -- which looks exactly
-- like the toggle "not working," even though it's the auto-recovery doing its job against
-- a real, pre-existing DB-level gap.
--
-- WHAT THIS DOES: instead of re-adding a second permissive RLS policy (the thing that
-- caused the original timeout), this adds one SECURITY DEFINER function per table. Each
-- function checks platform_admin_level() IS NOT NULL exactly ONCE per call -- not once
-- per row the way an OR'd RLS policy is evaluated -- and then reads as the function's
-- owner, which bypasses RLS on these tables entirely (Postgres does not apply RLS to a
-- table's owner unless that table has FORCE ROW LEVEL SECURITY set, which nothing in this
-- project's migrations has ever set). That sidesteps the "two permissive policies planner
-- trap" v3 identified, while still gating every call behind the same admin check the rest
-- of item 68 already uses.
--
-- Each function returns `SETOF public.<table>` (every column, matching %ROWTYPE
-- automatically) rather than a hand-typed column list, specifically so this migration
-- doesn't have to guess at this project's live column types from outside the database --
-- Cursus's client-side code already only reads the specific fields it needs off each
-- returned row (see the matching Cursus.html change), so the extra columns are harmless.
-- p_org_id NULL means "All organizations" (no filter, matching orgScoped()'s existing
-- null-means-unfiltered convention); a specific org id behaves like today's per-org view.
-- admin_cross_org_campaigns additionally takes p_user_id, mirroring userScoped().
-- admin_cross_org_audit_log additionally takes p_limit (default 200, matching Cursus's
-- existing .order('ts',{ascending:false}).limit(200)).
--
-- Every non-Super-Admin, and every Super Admin in "My organization" mode, is completely
-- unaffected by this migration -- the matching Cursus.html change only calls these RPCs
-- when _savOrgFilter !== _orgId (genuinely viewing cross-org), which by construction can
-- only ever be true for a Super Admin who has explicitly switched the selector.
--
-- Safe to run any time; safe to re-run (each function is created with OR REPLACE).
-- Requires 2026-09-07-item38-platform-admin-l1-migration.sql (platform_admin_level())
-- and v3/v4 to already be in place -- doesn't fail if v3/v4 haven't run, just becomes a
-- second, redundant way to read data you already had a policy for.

CREATE OR REPLACE FUNCTION public.admin_cross_org_audit_log(p_org_id uuid DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS SETOF public.audit_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_audit_log: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.audit_log
    WHERE (p_org_id IS NULL OR org_id = p_org_id)
    ORDER BY ts DESC
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_programmes(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.programmes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_programmes: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.programmes
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_campaigns(p_org_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS SETOF public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_campaigns: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.campaigns
    WHERE (p_org_id IS NULL OR org_id = p_org_id)
      AND (p_user_id IS NULL OR owner_id = p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_tasks(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_tasks: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.tasks
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_templates(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_templates: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.templates
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_partners(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.partners
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_partners: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.partners
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cross_org_campaign_partner_allocations(p_org_id uuid DEFAULT NULL)
RETURNS SETOF public.campaign_partner_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF platform_admin_level() IS NULL THEN
    RAISE EXCEPTION 'admin_cross_org_campaign_partner_allocations: caller is not a platform admin';
  END IF;
  RETURN QUERY
    SELECT * FROM public.campaign_partner_allocations
    WHERE (p_org_id IS NULL OR org_id = p_org_id);
END;
$$;

-- Only 'authenticated' can call these at all, and each function re-checks admin status
-- itself on every call regardless of who invokes it -- this grant alone does not expose
-- anything to non-admins.
GRANT EXECUTE ON FUNCTION public.admin_cross_org_audit_log(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_programmes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_campaigns(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_tasks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_templates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_partners(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cross_org_campaign_partner_allocations(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICATION -- run as yourself (a real Super Admin) in Supabase's SQL editor:
SELECT proname FROM pg_proc WHERE proname LIKE 'admin_cross_org_%' ORDER BY proname;
-- Should list all 7 function names above.

-- Then, as a genuine Super Admin (L0 or L1), sanity-check one directly:
-- SELECT * FROM admin_cross_org_programmes(NULL) LIMIT 5;   -- should return rows from every org
-- SELECT * FROM admin_cross_org_programmes('00000000-0000-0000-0000-000000000000') LIMIT 5; -- a real org id -> only that org's rows

-- ---------------------------------------------------------------------------
-- ROLLBACK -- if you ever want to remove these:
-- DROP FUNCTION IF EXISTS public.admin_cross_org_audit_log(uuid, int);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_programmes(uuid);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_campaigns(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_tasks(uuid);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_templates(uuid);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_partners(uuid);
-- DROP FUNCTION IF EXISTS public.admin_cross_org_campaign_partner_allocations(uuid);
