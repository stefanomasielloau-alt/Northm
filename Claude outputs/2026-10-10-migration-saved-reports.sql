-- 2026-10-10  Saved private / public reports (Reporting module)           Stef runs this once, in the Supabase SQL editor.
-- Adds ONE new table, public.saved_reports, plus two small helper functions and one guard trigger.
-- Nothing existing is altered. Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE).
-- Rollback: 2026-10-10-migration-saved-reports-ROLLBACK.sql  (back up the table first if anyone has saved reports).
--
-- A saved report is a DEFINITION, not data: name, description, who can see it, which Reporting tiles it shows and an optional
-- Board report setting (FY + period + prior-year comparison), all in `definition` (jsonb). Whoever opens a public report sees
-- the numbers their OWN access allows.
--
-- Who can do what (enforced here, not just on screen):
--   * Anyone in the organisation can create PRIVATE reports; only the owner can see, edit or delete them.
--   * PUBLIC reports are visible to everyone in the organisation. Making a report public needs a role with Publish or Configure
--     (or a platform admin). The owner edits/deletes their own; a Configure-role person or platform admin can also edit or
--     remove a PUBLIC report (moderation) but never sees someone else's private one.
--   * owner_id / org_id can never be changed after creation (guard trigger).

BEGIN;

CREATE TABLE IF NOT EXISTS public.saved_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_name  text,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  visibility  text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  definition  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_reports_org_vis_idx ON public.saved_reports (org_id, visibility);
CREATE INDEX IF NOT EXISTS saved_reports_owner_idx   ON public.saved_reports (owner_id);

-- Helper: may the signed-in user publish (make public) a report?  Role Publish or Configure, or platform admin.
CREATE OR REPLACE FUNCTION public.saved_reports_can_publish() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin()
      OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id = p.role_id
                 WHERE p.id = auth.uid() AND (COALESCE(r.publish,false) OR COALESCE(r.config,false)));
$$;

-- Helper: may the signed-in user moderate (edit/remove) a PUBLIC report they do not own?  Configure role or platform admin.
CREATE OR REPLACE FUNCTION public.saved_reports_can_moderate() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin()
      OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id = p.role_id
                 WHERE p.id = auth.uid() AND COALESCE(r.config,false));
$$;

GRANT EXECUTE ON FUNCTION public.saved_reports_can_publish()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.saved_reports_can_moderate() TO authenticated;

-- Guard: owner and organisation are fixed once created; updated_at always moves.
CREATE OR REPLACE FUNCTION public.saved_reports_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN RAISE EXCEPTION 'saved_reports.org_id cannot be changed'; END IF;
  IF OLD.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'saved_reports.owner_id cannot be changed'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS saved_reports_guard_trg ON public.saved_reports;
CREATE TRIGGER saved_reports_guard_trg BEFORE UPDATE ON public.saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.saved_reports_guard();

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_reports_select ON public.saved_reports;
CREATE POLICY saved_reports_select ON public.saved_reports FOR SELECT TO authenticated
  USING ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
          AND (visibility = 'public' OR owner_id = auth.uid()) );

DROP POLICY IF EXISTS saved_reports_insert ON public.saved_reports;
CREATE POLICY saved_reports_insert ON public.saved_reports FOR INSERT TO authenticated
  WITH CHECK ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
               AND owner_id = auth.uid()
               AND (visibility = 'private' OR public.saved_reports_can_publish()) );

DROP POLICY IF EXISTS saved_reports_update ON public.saved_reports;
CREATE POLICY saved_reports_update ON public.saved_reports FOR UPDATE TO authenticated
  USING ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
          AND (owner_id = auth.uid() OR (visibility = 'public' AND public.saved_reports_can_moderate())) )
  WITH CHECK ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
               AND ( (owner_id = auth.uid() AND (visibility = 'private' OR public.saved_reports_can_publish()))
                     OR (visibility = 'public' AND public.saved_reports_can_moderate()) ) );

DROP POLICY IF EXISTS saved_reports_delete ON public.saved_reports;
CREATE POLICY saved_reports_delete ON public.saved_reports FOR DELETE TO authenticated
  USING ( org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
          AND (owner_id = auth.uid() OR (visibility = 'public' AND public.saved_reports_can_moderate())) );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_reports TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---- Verification (read-only; run after the above) ----
-- select policyname, cmd, roles from pg_policies where schemaname='public' and tablename='saved_reports' order by cmd;   -- expect 4 rows
-- select count(*) from public.saved_reports;                                                                          -- expect 0
-- SECURITY CHECK: confirm is_platform_admin() exists (this file relies on it, as other migrations already do):
-- select proname from pg_proc where proname = 'is_platform_admin';
