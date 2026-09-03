-- 2026-09-03: Reporting module (Reportus.html) -- item 12 build
-- Two new columns. Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS access_reportus BOOLEAN NOT NULL DEFAULT false;
-- Org-level ceiling for the new Reporting module, same pattern as access_ordo,
-- access_cursus, etc. Defaults to false (locked down) -- an admin turns it on
-- for the organisation in Configuration -> Organizations, then grants it to
-- specific people via each person's Modules toggle (profiles.module_overrides,
-- no schema change needed there -- it's already a flexible JSON column).

ALTER TABLE roles ADD COLUMN IF NOT EXISTS report_scope TEXT NOT NULL DEFAULT 'own_org';
-- What a role sees in the Reporting module. One of:
--   'own_org'  (default) -- this organisation only.
--   'all'      -- only differs from 'own_org' for a Super Admin (who already
--                 bypasses RLS); for a regular role it behaves like 'own_org'
--                 today, since no RLS policy grants cross-organisation reads.
--   'sub_org'  -- the org-hierarchy display in Reportus (Organization page) is
--                 real for every scope, but financial figures still stay
--                 organisation-wide at this scope -- widening that needs an
--                 RLS policy change on campaigns/deals/events/assets, not made
--                 here. Reportus's own scope-resolution comment explains this
--                 in full and shows it on-screen rather than silently
--                 under-filtering.
--   'region'   -- real and enforced client-side in Reportus: narrows the
--                 Campaigns tiles to the viewer's profiles.region_ids (or
--                 everything, if their profile has cross_region set). Deals,
--                 Events, Assets and Activities don't carry region tagging in
--                 the schema today, so those stay organisation-wide at this
--                 scope -- also flagged on-screen.
--   'team'     -- stored and selectable in Configuration -> Roles & users, but
--                 no table has a team_id column yet (only teams.member_ids,
--                 i.e. team -> people, not team -> campaign/deal/event/asset),
--                 so nothing narrows on it yet.
-- Configured per role in Configuration -> Roles & users -> Report scope.
