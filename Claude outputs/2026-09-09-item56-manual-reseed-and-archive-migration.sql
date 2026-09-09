-- 2026-09-09 (backlog item 56, steps 3-6 of claude/2026-09-09-item56-auto-inject-seed-data-design.md):
-- extracts the org-seeding logic into a reusable, idempotent function; adds
-- an admin-gated manual "re-seed" entry point; adds tracking_ref to the two
-- tables (regions, cost_buckets) that didn't have one, so ALL FIVE seeded
-- tables can be found/archived/restored reliably; and adds a soft-archive
-- (never hard-delete) path for an org's example data, per Stef's explicit
-- "soft-archive" decision on 2026-09-09.
--
-- Safe to run multiple times -- every CREATE is OR REPLACE / IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1. Two columns that were missing from the original 2026-09-08 seed trigger:
--    regions/cost_buckets never got a tracking_ref, so there was no reliable,
--    collision-free way to find "just the starter-kit rows" in those two
--    tables later (matching by name/code like 'ANZ' or 'CONTENT' would risk
--    catching a real org's own identically-named region or cost bucket).
--    Purely additive, nullable, never set by any existing app code path
--    (addRegion()/addCostBucket() in Ordo.html don't send this field, and a
--    Supabase upsert with an explicit column list leaves omitted columns
--    untouched) -- cannot affect any existing row or save path.
ALTER TABLE regions ADD COLUMN IF NOT EXISTS tracking_ref text;
ALTER TABLE cost_buckets ADD COLUMN IF NOT EXISTS tracking_ref text;

-- ---------------------------------------------------------------------------
-- 2. The reusable, idempotent seeding worker -- same body as
--    2026-09-08-item5-auto-seed-new-org-trigger.sql's seed_new_organization(),
--    parameterized on org_id instead of reading NEW.id, now also tagging
--    regions/cost_buckets with tracking_ref, and skipping entirely if this
--    org already has starter-kit campaigns (idempotent: the automatic
--    trigger and the manual button can both call this safely, including
--    twice in a row, without ever creating two starter kits side by side).
--
--    Deliberately carries NO caller-identity check of its own. The trigger
--    below must keep working for every org-creation path this project has
--    always supported, including a raw INSERT run directly in Supabase's
--    own SQL editor or table editor -- which has no authenticated
--    auth.uid() at all. Gating this function itself would silently break
--    automatic seeding for exactly that case. Instead: EXECUTE on this
--    function is revoked from ordinary roles below, so it can only ever run
--    (a) internally, invoked by the trigger below, or (b) internally,
--    invoked by the admin-gated wrapper further down -- never callable
--    directly over Supabase's RPC endpoint by a signed-in user, regardless
--    of what org_id they pass.
CREATE OR REPLACE FUNCTION seed_organization_starter_kit(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_region_anz uuid := gen_random_uuid();
  v_region_sea uuid := gen_random_uuid();
  v_region_unassigned uuid := gen_random_uuid();
  v_bucket_content uuid := gen_random_uuid();
  v_bucket_paidmedia uuid := gen_random_uuid();
  v_bucket_events uuid := gen_random_uuid();
  v_bucket_email uuid := gen_random_uuid();
  v_bucket_agency uuid := gen_random_uuid();
  v_programme uuid := gen_random_uuid();
  v_campaign1 uuid := gen_random_uuid();
  v_campaign2 uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM campaigns WHERE org_id = p_org_id AND tracking_ref = 'auto-seed-example') THEN
    RETURN;
  END IF;

  INSERT INTO regions (id, org_id, name, tracking_ref) VALUES
    (v_region_anz, p_org_id, 'ANZ', 'auto-seed-example'),
    (v_region_sea, p_org_id, 'SEA', 'auto-seed-example'),
    (v_region_unassigned, p_org_id, 'Unassigned', 'auto-seed-example');

  INSERT INTO cost_buckets (id, org_id, code, label, tracking_ref) VALUES
    (v_bucket_content,   p_org_id, 'CONTENT',   'Content & creative', 'auto-seed-example'),
    (v_bucket_paidmedia, p_org_id, 'PAIDMEDIA', 'Paid media & advertising', 'auto-seed-example'),
    (v_bucket_events,    p_org_id, 'EVENTS',    'Events & sponsorship', 'auto-seed-example'),
    (v_bucket_email,     p_org_id, 'EMAIL',     'Email & marketing automation', 'auto-seed-example'),
    (v_bucket_agency,    p_org_id, 'AGENCY',    'Agency & contractor fees', 'auto-seed-example');

  INSERT INTO programmes (id, org_id, name, owner, focus, status, tracking_ref) VALUES
    (v_programme, p_org_id, 'Starter Programme (example -- safe to delete)', 'Winnie Pooh', 'Demand generation', 'Active', 'auto-seed-example');

  INSERT INTO campaigns (
    id, org_id, name, programme_id, region_id, cost_bucket_id,
    start_date, end_date, budget, signoff_status, period_type, period_label,
    tracking_ref, business_case, owner_name, owner_email, sort_order
  ) VALUES
    (v_campaign1, p_org_id, 'Example Campaign: Honey Jar Launch (safe to delete)',
     v_programme, v_region_anz, v_bucket_paidmedia,
     CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', 20000, 'Draft', 'quarter', 'Example',
     'auto-seed-example', 'Example campaign showing a typical launch structure -- delete once you''ve had a look.', 'Winnie Pooh', 'pooh@example.invalid', 1),
    (v_campaign2, p_org_id, 'Example Campaign: Webinar Series (safe to delete)',
     v_programme, v_region_sea, v_bucket_events,
     CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 5000, 'Draft', 'quarter', 'Example',
     'auto-seed-example', 'Example campaign showing an events-led motion -- delete once you''ve had a look.', 'Owl', 'owl@example.invalid', 2);

  INSERT INTO tasks (id, org_id, campaign_id, name, type, owner, start_date, due_date, status, cost_bucket_id, planned_cost, committed_cost, actual_cost, tracking_ref, sort_order) VALUES
    (gen_random_uuid(), p_org_id, v_campaign1, 'Example activity: design creative', 'Content', 'Piglet', CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days', 'Planned', v_bucket_content, 3000, 0, 0, 'auto-seed-example', 1),
    (gen_random_uuid(), p_org_id, v_campaign1, 'Example activity: run paid media flight', 'Paid Media', 'Tigger', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE + INTERVAL '45 days', 'Planned', v_bucket_paidmedia, 15000, 0, 0, 'auto-seed-example', 2),
    (gen_random_uuid(), p_org_id, v_campaign2, 'Example activity: book speakers', 'Events', 'Owl', CURRENT_DATE, CURRENT_DATE + INTERVAL '10 days', 'Planned', v_bucket_events, 2000, 0, 0, 'auto-seed-example', 1);
END;
$func$;

REVOKE EXECUTE ON FUNCTION seed_organization_starter_kit(uuid) FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION seed_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  PERFORM seed_organization_starter_kit(NEW.id);
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_seed_new_organization ON organizations;
CREATE TRIGGER trg_seed_new_organization
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION seed_new_organization();

-- ---------------------------------------------------------------------------
-- 3. Manual "Re-seed example data" entry point -- Super-Admin-gated (same
--    check pattern as move_role_to_org() from item 39), callable via
--    sb.rpc('admin_reseed_organization', {p_org_id}). Wired to a new button
--    in Norma.html's Org Edit modal (Super Admin only, same gate as every
--    other cross-org action on that screen).
CREATE OR REPLACE FUNCTION admin_reseed_organization(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NOT COALESCE(is_platform_admin() OR platform_admin_level() IS NOT NULL, false) THEN
    RAISE EXCEPTION 'Only a Super Admin can (re-)seed example data for an organization.';
  END IF;
  PERFORM seed_organization_starter_kit(p_org_id);
END;
$func$;
GRANT EXECUTE ON FUNCTION admin_reseed_organization(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Soft-archive path (Stef's explicit 2026-09-09 decision: archive, never
--    hard-delete). Rather than adding an archived_at column to all 5
--    seeded tables and then having to retrofit a filter into every one of
--    the 10 module files that read campaigns/tasks/programmes/regions/
--    cost_buckets (a large, invasive change with real regression risk for
--    a "hide my demo data" convenience feature), archived rows are moved
--    whole into one small holding table and removed from the live tables --
--    genuinely gone from every existing view with ZERO changes to any of
--    the 10 files, while the original data is fully preserved and
--    restorable. This is the DB-row equivalent of "move to /archive" rather
--    than delete: reversible, inspectable, nothing silently destroyed.
CREATE TABLE IF NOT EXISTS archived_seed_rows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_name    text NOT NULL,
  row_id        uuid NOT NULL,
  row_data      jsonb NOT NULL,
  archived_at   timestamptz NOT NULL DEFAULT now(),
  archived_by   uuid REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS archived_seed_rows_org_idx ON archived_seed_rows (org_id);
ALTER TABLE archived_seed_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archived_seed_rows_read ON archived_seed_rows;
CREATE POLICY archived_seed_rows_read ON archived_seed_rows
  FOR SELECT USING (
    is_platform_admin() OR platform_admin_level() IS NOT NULL
    OR org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid())
  );

CREATE OR REPLACE FUNCTION archive_seed_data(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_by uuid := auth.uid();
  v_n integer;
  v_total integer := 0;
BEGIN
  IF NOT COALESCE(is_platform_admin() OR platform_admin_level() IS NOT NULL, false) THEN
    RAISE EXCEPTION 'Only a Super Admin can archive example data for an organization.';
  END IF;

  WITH moved AS (
    DELETE FROM tasks WHERE org_id = p_org_id AND tracking_ref = 'auto-seed-example' RETURNING *
  )
  INSERT INTO archived_seed_rows (org_id, table_name, row_id, row_data, archived_by)
  SELECT p_org_id, 'tasks', id, to_jsonb(moved), v_by FROM moved;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  WITH moved AS (
    DELETE FROM campaigns WHERE org_id = p_org_id AND tracking_ref = 'auto-seed-example' RETURNING *
  )
  INSERT INTO archived_seed_rows (org_id, table_name, row_id, row_data, archived_by)
  SELECT p_org_id, 'campaigns', id, to_jsonb(moved), v_by FROM moved;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  WITH moved AS (
    DELETE FROM programmes WHERE org_id = p_org_id AND tracking_ref = 'auto-seed-example' RETURNING *
  )
  INSERT INTO archived_seed_rows (org_id, table_name, row_id, row_data, archived_by)
  SELECT p_org_id, 'programmes', id, to_jsonb(moved), v_by FROM moved;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  WITH moved AS (
    DELETE FROM cost_buckets WHERE org_id = p_org_id AND tracking_ref = 'auto-seed-example' RETURNING *
  )
  INSERT INTO archived_seed_rows (org_id, table_name, row_id, row_data, archived_by)
  SELECT p_org_id, 'cost_buckets', id, to_jsonb(moved), v_by FROM moved;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  WITH moved AS (
    DELETE FROM regions WHERE org_id = p_org_id AND tracking_ref = 'auto-seed-example' RETURNING *
  )
  INSERT INTO archived_seed_rows (org_id, table_name, row_id, row_data, archived_by)
  SELECT p_org_id, 'regions', id, to_jsonb(moved), v_by FROM moved;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  RETURN v_total;
END;
$func$;
GRANT EXECUTE ON FUNCTION archive_seed_data(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION restore_seed_data(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_total integer := 0;
  r record;
BEGIN
  IF NOT COALESCE(is_platform_admin() OR platform_admin_level() IS NOT NULL, false) THEN
    RAISE EXCEPTION 'Only a Super Admin can restore archived example data for an organization.';
  END IF;

  FOR r IN SELECT * FROM archived_seed_rows WHERE org_id = p_org_id AND table_name = 'regions' LOOP
    INSERT INTO regions (id, org_id, name, tracking_ref)
      VALUES (r.row_id, r.org_id, r.row_data->>'name', r.row_data->>'tracking_ref')
      ON CONFLICT (id) DO NOTHING;
    DELETE FROM archived_seed_rows WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;

  FOR r IN SELECT * FROM archived_seed_rows WHERE org_id = p_org_id AND table_name = 'cost_buckets' LOOP
    INSERT INTO cost_buckets (id, org_id, code, label, tracking_ref)
      VALUES (r.row_id, r.org_id, r.row_data->>'code', r.row_data->>'label', r.row_data->>'tracking_ref')
      ON CONFLICT (id) DO NOTHING;
    DELETE FROM archived_seed_rows WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;

  FOR r IN SELECT * FROM archived_seed_rows WHERE org_id = p_org_id AND table_name = 'programmes' LOOP
    INSERT INTO programmes (id, org_id, name, owner, focus, status, tracking_ref)
      VALUES (r.row_id, r.org_id, r.row_data->>'name', r.row_data->>'owner', r.row_data->>'focus', r.row_data->>'status', r.row_data->>'tracking_ref')
      ON CONFLICT (id) DO NOTHING;
    DELETE FROM archived_seed_rows WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;

  FOR r IN SELECT * FROM archived_seed_rows WHERE org_id = p_org_id AND table_name = 'campaigns' LOOP
    INSERT INTO campaigns (
      id, org_id, name, programme_id, region_id, cost_bucket_id,
      start_date, end_date, budget, signoff_status, period_type, period_label,
      tracking_ref, business_case, owner_name, owner_email, sort_order
    ) VALUES (
      r.row_id, r.org_id, r.row_data->>'name',
      NULLIF(r.row_data->>'programme_id','')::uuid, NULLIF(r.row_data->>'region_id','')::uuid, NULLIF(r.row_data->>'cost_bucket_id','')::uuid,
      NULLIF(r.row_data->>'start_date','')::date, NULLIF(r.row_data->>'end_date','')::date,
      NULLIF(r.row_data->>'budget','')::numeric, r.row_data->>'signoff_status', r.row_data->>'period_type', r.row_data->>'period_label',
      r.row_data->>'tracking_ref', r.row_data->>'business_case', r.row_data->>'owner_name', r.row_data->>'owner_email',
      NULLIF(r.row_data->>'sort_order','')::integer
    ) ON CONFLICT (id) DO NOTHING;
    DELETE FROM archived_seed_rows WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;

  FOR r IN SELECT * FROM archived_seed_rows WHERE org_id = p_org_id AND table_name = 'tasks' LOOP
    INSERT INTO tasks (
      id, org_id, campaign_id, name, type, owner, start_date, due_date, status,
      cost_bucket_id, planned_cost, committed_cost, actual_cost, tracking_ref, sort_order
    ) VALUES (
      r.row_id, r.org_id, NULLIF(r.row_data->>'campaign_id','')::uuid, r.row_data->>'name', r.row_data->>'type', r.row_data->>'owner',
      NULLIF(r.row_data->>'start_date','')::date, NULLIF(r.row_data->>'due_date','')::date, r.row_data->>'status',
      NULLIF(r.row_data->>'cost_bucket_id','')::uuid, NULLIF(r.row_data->>'planned_cost','')::numeric,
      NULLIF(r.row_data->>'committed_cost','')::numeric, NULLIF(r.row_data->>'actual_cost','')::numeric,
      r.row_data->>'tracking_ref', NULLIF(r.row_data->>'sort_order','')::integer
    ) ON CONFLICT (id) DO NOTHING;
    DELETE FROM archived_seed_rows WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$func$;
GRANT EXECUTE ON FUNCTION restore_seed_data(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verification, run these after applying the migration:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN
--     ('seed_organization_starter_kit','admin_reseed_organization','archive_seed_data','restore_seed_data');
--   SELECT has_function_privilege('authenticated','seed_organization_starter_kit(uuid)','execute'); -- expect false
--   SELECT has_function_privilege('authenticated','admin_reseed_organization(uuid)','execute');      -- expect true
