-- 2026-09-03: Alerts/Business Units -- attach a live business unit to an alert group
-- Adds the one new column both Norma.html and Schema.html now read/write on `teams`.
-- Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE teams ADD COLUMN IF NOT EXISTS unit_ids UUID[] DEFAULT '{}'::uuid[];

-- unit_ids: business_units.id values attached to this alert group (teams row). A manager
-- (or Admin) can attach a whole business unit instead of, or alongside, individually
-- picked people (teams.member_ids, unchanged). Resolved LIVE at fire time by
-- resolveTargetUserIds() in Schema.html -- adding someone to the unit later means they
-- start receiving that alert group's notifications without anyone re-saving the
-- automation. Empty array (not NULL) is the default so both files' `t.unit_ids||[]`
-- fallbacks are just a defensive extra, not load-bearing.
