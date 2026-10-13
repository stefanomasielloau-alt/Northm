-- 2026-10-14 -- Advanced reports (paid add-on) + saved Relationship map views.
-- Stef: chart-library elements in saved/custom reports are an advanced (pay-more) feature, switched on per org
-- in Configuration > Licensing; the org then lets All or Selected people create them; everyone can still see the
-- org's public reports. Saved Relationship map views (live or frozen) are basic, for everyone.
-- Additive, safe to re-run. Rollback: 2026-10-14-migration-advanced-reports-and-map-views-ROLLBACK.sql
BEGIN;

-- 1. The paid add-on, on the org's plan (Licensing, platform admins only -- same as Benchmark reporting)
ALTER TABLE public.org_plans ADD COLUMN IF NOT EXISTS advanced_reports_addon boolean NOT NULL DEFAULT false;
ALTER TABLE public.org_plans ADD COLUMN IF NOT EXISTS advanced_reports_price  numeric NOT NULL DEFAULT 0;

-- 2. Who in the org may create advanced reports: {"mode":"all"} or {"mode":"selected","user_ids":[...]}
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS advanced_reports_creators jsonb NOT NULL DEFAULT '{"mode":"all","user_ids":[]}'::jsonb;

-- 3. Entitlement checks (SECURITY DEFINER: ordinary users cannot read org_plans, but may ask these questions)
CREATE OR REPLACE FUNCTION public.advanced_reports_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_plans op
                  WHERE op.org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
                    AND op.advanced_reports_addon
                    AND op.status NOT IN ('expired','cancelled'));
$$;
CREATE OR REPLACE FUNCTION public.advanced_reports_can_create() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.advanced_reports_enabled() AND (
           public.is_platform_admin()
        OR COALESCE((SELECT s.advanced_reports_creators->>'mode' FROM public.org_settings s
                      WHERE s.org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())), 'all') = 'all'
        OR EXISTS (SELECT 1 FROM public.org_settings s
                    WHERE s.org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
                      AND (s.advanced_reports_creators->'user_ids') ? (auth.uid())::text));
$$;
GRANT EXECUTE ON FUNCTION public.advanced_reports_enabled()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.advanced_reports_can_create() TO authenticated;

-- 4. Guard: a saved report may only carry chart-library elements ("widgets") if its author is entitled.
--    Editing a report WITHOUT changing its widgets (e.g. a moderator renaming a public one) is always allowed.
CREATE OR REPLACE FUNCTION public.saved_reports_advanced_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_typeof(NEW.definition->'widgets') = 'array' AND jsonb_array_length(NEW.definition->'widgets') > 0
     AND (TG_OP = 'INSERT' OR NEW.definition->'widgets' IS DISTINCT FROM OLD.definition->'widgets')
     AND NOT public.advanced_reports_can_create() THEN
    RAISE EXCEPTION 'Advanced reports (chart library elements) are not enabled for you' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS saved_reports_advanced_guard_trg ON public.saved_reports;
CREATE TRIGGER saved_reports_advanced_guard_trg BEFORE INSERT OR UPDATE ON public.saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.saved_reports_advanced_guard();

-- 5. Saved Relationship map views (basic, everyone). live = redrawn from current data; frozen = picture as at frozen_at.
CREATE TABLE IF NOT EXISTS public.relationship_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_name    text,
  name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  visibility    text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  mode          text NOT NULL DEFAULT 'live' CHECK (mode IN ('live','frozen')),
  view          jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_svg  text CHECK (snapshot_svg IS NULL OR char_length(snapshot_svg) <= 3000000),
  snapshot_meta jsonb,
  frozen_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS relationship_views_org_vis_idx ON public.relationship_views (org_id, visibility);
CREATE OR REPLACE FUNCTION public.relationship_views_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN RAISE EXCEPTION 'relationship_views.org_id cannot be changed'; END IF;
  IF OLD.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'relationship_views.owner_id cannot be changed'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS relationship_views_guard_trg ON public.relationship_views;
CREATE TRIGGER relationship_views_guard_trg BEFORE UPDATE ON public.relationship_views
  FOR EACH ROW EXECUTE FUNCTION public.relationship_views_guard();
ALTER TABLE public.relationship_views ENABLE ROW LEVEL SECURITY;
-- same visibility / publish / moderation rules as saved_reports
DROP POLICY IF EXISTS relationship_views_select ON public.relationship_views;
CREATE POLICY relationship_views_select ON public.relationship_views FOR SELECT TO authenticated
  USING ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
          AND (visibility = 'public' OR owner_id = auth.uid()) );
DROP POLICY IF EXISTS relationship_views_insert ON public.relationship_views;
CREATE POLICY relationship_views_insert ON public.relationship_views FOR INSERT TO authenticated
  WITH CHECK ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
               AND owner_id = auth.uid()
               AND (visibility = 'private' OR public.saved_reports_can_publish()) );
DROP POLICY IF EXISTS relationship_views_update ON public.relationship_views;
CREATE POLICY relationship_views_update ON public.relationship_views FOR UPDATE TO authenticated
  USING ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
          AND (owner_id = auth.uid() OR (visibility = 'public' AND public.saved_reports_can_moderate())) )
  WITH CHECK ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
               AND ( (owner_id = auth.uid() AND (visibility = 'private' OR public.saved_reports_can_publish()))
                     OR (visibility = 'public' AND public.saved_reports_can_moderate()) ) );
DROP POLICY IF EXISTS relationship_views_delete ON public.relationship_views;
CREATE POLICY relationship_views_delete ON public.relationship_views FOR DELETE TO authenticated
  USING ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
          AND (owner_id = auth.uid() OR (visibility = 'public' AND public.saved_reports_can_moderate())) );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationship_views TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationship_views TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Checks after running:
-- SELECT public.advanced_reports_enabled(), public.advanced_reports_can_create();   -- false until Licensing ticks the add-on
-- SELECT org_id, advanced_reports_creators FROM org_settings;
-- SELECT count(*) FROM relationship_views;
