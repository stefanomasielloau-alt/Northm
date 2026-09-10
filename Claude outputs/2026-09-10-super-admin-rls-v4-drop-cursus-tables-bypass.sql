-- Item 68 -- v4: drop the Super Admin bypass on every table Cursus's own boot query
-- touches, 2026-09-10
--
-- Stef: v3 (dropping just audit_log's bypass) did NOT fix it -- Cursus still times out
-- and logs you out; every other module still works fine.
--
-- I was wrong to assume audit_log alone was "the big table." Other modules are
-- unaffected because they don't have item 68's code wired in at all yet -- only Cursus
-- does -- so the problem has to be one (or more) of the OTHER tables Cursus's own boot
-- reads: programmes, campaigns, tasks, templates, partners, campaign_partner_allocations.
-- This project has been reseeded with test data multiple times across several test/beta
-- orgs (multiple seed scripts in Claude outputs/ this project), so I no longer trust my
-- earlier assumption that only audit_log has enough rows to matter -- I don't actually
-- know each of these tables' row counts from here, and guessing again table-by-table
-- isn't the responsible way to get you unblocked.
--
-- WHAT THIS DOES: drops the Super Admin bypass policy from every table in that list,
-- restoring ALL of them to exactly their pre-item-68 behavior. Combined with v3 (already
-- run), this fully reverts every table Cursus's boot reads back to how they worked before
-- today -- Cursus should load normally again regardless of which specific table was
-- actually the slow one, since none of them can hit the "two permissive policies" planner
-- issue anymore.
--
-- TRADE-OFF, please read: until a better-designed fix is in place, Cursus's Super Admin
-- toolbar will still render (the UI code is untouched), but selecting "All organizations"
-- or another organization won't actually show that other data -- the database will just
-- keep returning your own org's rows regardless of what's selected, because the
-- permission to read cross-org is what this rolls back. Nothing breaks, nothing risks
-- other orgs' data, it just means the cross-org VIEW capability isn't functional yet on
-- these tables -- only the "My organization" option (today's normal behavior) actually
-- works right now. I'll need to find a performance-safe way to grant the cross-org read
-- (likely a differently-structured policy, or a SECURITY DEFINER RPC instead of a second
-- permissive policy) before re-enabling it -- not guessing that in place under time
-- pressure while you're blocked.
--
-- Every other (untouched-by-Cursus) table from v1/v2's original 50 is left as-is for now.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['programmes','campaigns','tasks','templates','partners','campaign_partner_allocations'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_super_admin_all', tbl);
    RAISE NOTICE 'Dropped (if it existed): %', tbl;
  END LOOP;
END $$;

-- Verification -- should return only tables NOT in the list above (i.e. nothing from
-- Cursus's own reads should show up here anymore):
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE policyname LIKE '%_super_admin_all'
ORDER BY tablename;
