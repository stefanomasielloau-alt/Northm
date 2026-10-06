-- Item 73 -- drop the underlying Super Admin RLS bypass *policy* on the 5 tables
-- item 70 covers: augur_deals, eventus_events, assets, crm_activities,
-- prospectus_leads. 2026-10-06.
--
-- Same pattern as 2026-09-10-super-admin-rls-v7-drop-remaining-bypass.sql: just
-- DROP POLICY IF EXISTS on the original "<table>_super_admin_all" bypass policy,
-- guarded by a table_type='BASE TABLE' existence check (the same guard v7 needed
-- after v6 hit "campaign_rollups is not a table" and rolled back its whole DO $$
-- block -- see claude/running-log.md). Doesn't touch any data, doesn't touch any
-- other policy.
--
-- WHY THIS FILE EXISTS, AND A DISCREPANCY WORTH CHECKING BEFORE YOU RUN IT:
-- Item 70's own header (Claude outputs/2026-09-17-item70-admin-cross-org-rpcs-v2.sql)
-- says explicitly that it "does NOT touch the existing bypass policy on these 5
-- tables," calling that "a separate, larger migration (see item 73)" -- i.e. as of
-- 2026-09-17, these 5 tables were believed to still carry the bypass.
--
-- But re-reading v7 itself (2026-09-10, a week earlier) while writing this: v7's own
-- `tables` array already lists all 5 of these exact table names (assets, augur_deals,
-- crm_activities, eventus_events, prospectus_leads) alongside the ~37 others it closes.
-- So one of two things is true, and I can't tell which from the repo alone:
--   (a) v7 was confirmed run cleanly after its v6 bug fix, in which case these 5
--       tables' bypass policies are already gone, and this file's DROP POLICY IF
--       EXISTS calls will just no-op (harmless) -- or
--   (b) v7 either wasn't run, or ran before these 5 tables existed / had this policy
--       in their final form, in which case this file is exactly the migration item
--       73 asks for.
-- `DROP POLICY IF EXISTS` is a safe no-op either way, so this file is correct to run
-- regardless -- but run the verification SELECT at the very bottom FIRST (it's
-- read-only) to see which case you're actually in before you run the DO $$ block.
--
-- Not run from this session -- SQL execution against this project is blocked for me
-- here (classifier: "[Production Deploy]"). Written only; run it yourself in the
-- Supabase SQL editor.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'augur_deals','eventus_events','assets','crm_activities','prospectus_leads'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl AND table_type='BASE TABLE') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_super_admin_all', tbl);
      RAISE NOTICE 'Dropped (if it existed): %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (table does not exist): %', tbl;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- VERIFICATION -- run this SELECT first, by itself, before the DO $$ block above:
-- it's read-only and tells you which of the two cases in the header you're in.
-- Empty result = already clean (case a); any rows = this migration still has work
-- to do (case b).
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('augur_deals','eventus_events','assets','crm_activities','prospectus_leads')
  AND policyname LIKE '%_super_admin_all'
ORDER BY tablename;

-- After running the DO $$ block, re-run the same SELECT -- it should now return
-- zero rows.

-- ---------------------------------------------------------------------------
-- TRADE-OFF (same shape as v4's and v7's): once this runs, selecting "All
-- organizations" or a specific other org in the Super Admin bar will stop
-- returning other orgs' rows for these 5 tables -- the database will keep
-- returning your own org's rows regardless of what's selected. "My organization"
-- (the default) is completely unaffected. Item 70's admin_cross_org_*() RPCs
-- already give a safe, audited way back to deliberate cross-org reads on these
-- same 5 tables (Reportus.html or any other module can call them), so this
-- migration doesn't remove any capability that was actually relied on -- it
-- closes the direct-table bypass now that the RPC path exists.
