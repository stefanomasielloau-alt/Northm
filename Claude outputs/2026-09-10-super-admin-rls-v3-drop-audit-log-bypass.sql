-- Item 68 -- v3: drop the Super Admin bypass policy on audit_log only, 2026-09-10
--
-- Stef, right after running v2: "canceling statement due to statement timeout" trying
-- to open Cursus.
--
-- WORKING HYPOTHESIS (not confirmed against the actual query plan -- I have no direct
-- database access from here, so I can't run EXPLAIN ANALYZE myself. This is my best
-- reasoning from what changed and when, not a verified fact):
--
-- audit_log is the one table in the whole v1/v2 migration that's genuinely large in this
-- project (~398k rows -- the same table that needed its own performance index back on
-- 2026-09-10 earlier today just to stop it timing out on its OWN org-scoped read). Adding
-- a second permissive RLS policy to a table like that is a well-known Postgres/Supabase
-- performance trap: once a table has more than one permissive policy for the same
-- command, Postgres has to evaluate them as `policy_1_condition OR policy_2_condition`,
-- and RLS-protected reads are planned as a "security barrier" -- which can prevent the
-- planner from pushing the query's own `.eq('org_id', ...)` filter down to use the
-- (org_id, ts) index efficiently once a second, function-calling policy is in the mix,
-- even though that second policy's condition (is_platform_admin() / platform_admin_
-- level()) doesn't reference org_id or ts at all. The practical effect: a query that used
-- to hit the index now silently falls back to a slow scan across (a meaningful fraction
-- of) the table, and on ~398k rows that's exactly the kind of thing that blows a
-- statement timeout. None of the other 49 tables in the migration are anywhere near this
-- size in this project (test/beta data), so they're very unlikely to hit the same wall --
-- this fix touches audit_log alone, nothing else.
--
-- WHAT THIS DOES: removes ONLY the audit_log_super_admin_all policy added by v1/v2,
-- restoring audit_log to exactly its pre-item-68 behavior (each user, Super Admin or not,
-- sees their own org's audit trail only -- the fast, indexed path that already works
-- today). Every other table's Super Admin bypass (campaigns, tasks, partners, etc.)
-- is untouched -- this does not reduce anything Cursus's pilot needs to work in 'own'
-- mode, and Cursus's audit_log read was already only ever using the viewer's own org in
-- that mode regardless (the bypass only mattered for a future "view audit trail across
-- ALL orgs" capability, which isn't built or needed yet).
--
-- IF THIS DOESN'T FIX IT: the timeout is coming from something else, and the next step
-- is checking Supabase's own Postgres logs (Dashboard -> Logs -> Postgres Logs, or
-- Reports -> Query Performance) for the exact statement that got cancelled, rather than
-- guessing further from here.

DROP POLICY IF EXISTS audit_log_super_admin_all ON public.audit_log;

-- Verification -- should return zero rows after this runs:
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'audit_log' AND policyname LIKE '%_super_admin_all';
