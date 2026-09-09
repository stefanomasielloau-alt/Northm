-- Item 38 -- fold Reporting into Viewer, 2026-09-09
--
-- Confirms Stef's ask precisely: L0 and L1 are both full North Super Users (already built,
-- 2026-09-07-item38-platform-admin-l1-migration.sql -- unchanged, nothing to redo there).
-- L2/L3 ("Client company super user") were never built as a formal numbered tier -- North's
-- roles are named per-org, not a fixed ladder (see Norma.html's own comment: "North's roles
-- aren't a fixed ladder like Hub's five tiers"). Flagged separately for a one-line confirm
-- before touching that (see the accompanying chat message) rather than guessing at a schema
-- change in an area that's already caused three real data-corruption incidents this project.
--
-- This migration is the one unambiguous, safe piece: "Reporting for Viewer also" --
-- backfills access_reportus=true for every EXISTING role literally named "Viewer"
-- (case-insensitive, trimmed) across every org. Going forward, Norma.html's addRole()
-- already does this automatically for any NEW role named "Viewer" (Northm commit, this
-- session) -- this migration is the one-time catch-up for roles that already existed
-- before that code shipped.
--
-- Safe to run multiple times -- WHERE clause only ever turns the flag ON for a role that's
-- both named "Viewer" and not already true; never touches any other role, never turns it off.

UPDATE roles
SET access_reportus = true
WHERE lower(trim(name)) = 'viewer'
  AND access_reportus IS DISTINCT FROM true;

-- Verification -- lists every "Viewer" role and its Reportus flag; every row's
-- access_reportus should read true after running the UPDATE above.
SELECT id, org_id, name, access_reportus
FROM roles
WHERE lower(trim(name)) = 'viewer'
ORDER BY org_id;
