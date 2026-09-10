-- Audit log archival plan -- 2026-09-10
--
-- Stef's answer to the retention question: "archive/retire old rows if not
-- used/redundant." This is the concrete plan for that -- FOR REVIEW ONLY,
-- nothing in here has been run. Matches this project's own "never delete
-- without an archived copy first" convention.
--
-- Proposed retention window: keep the most recent 12 months of audit_log
-- rows in the live table, move anything older into a new audit_log_archive
-- table. 12 months is a starting guess, not something confirmed with Stef --
-- change the interval below (or tell me the number you want) before running
-- Step 2. Nothing here assumes a specific number is right.
--
-- Requires the performance index from 2026-09-10-audit-log-performance-index.sql
-- to already be in place (it makes both the archive SELECT below and normal
-- day-to-day audit_log reads fast) -- run that one first if it hasn't run yet.

-- ---------------------------------------------------------------------------
-- STEP 1 -- create the archive table (same shape as audit_log, its own copy)
-- Safe to run any time; creates nothing in audit_log itself.

CREATE TABLE IF NOT EXISTS audit_log_archive (LIKE audit_log INCLUDING ALL);

-- ---------------------------------------------------------------------------
-- STEP 2 -- copy old rows into the archive (does NOT touch the live table)
-- Adjust the interval to whatever retention window you want, then run.

INSERT INTO audit_log_archive
SELECT * FROM audit_log
WHERE ts < (now() - interval '12 months')::text
ON CONFLICT DO NOTHING;

-- Verify the copy landed correctly before going anywhere near Step 3:
--   SELECT count(*) FROM audit_log_archive;
--   SELECT min(ts), max(ts) FROM audit_log_archive;
-- Spot check a handful of rows exist in both tables identically, e.g.:
--   SELECT * FROM audit_log WHERE org_id = '<some org uuid>' ORDER BY ts LIMIT 5;
--   SELECT * FROM audit_log_archive WHERE org_id = '<same org uuid>' ORDER BY ts LIMIT 5;

-- ---------------------------------------------------------------------------
-- STEP 3 -- delete the archived rows from the live table
-- DELIBERATELY LEFT COMMENTED OUT. Only run this after Step 2's copy is
-- verified correct (per Stef's standing "explicit confirmation before any
-- delete" rule) -- and only Stef should decide when that verification is
-- good enough to proceed.
--
-- DELETE FROM audit_log
-- WHERE ts < (now() - interval '12 months')::text
--   AND id IN (SELECT id FROM audit_log_archive);

-- ---------------------------------------------------------------------------
-- Notes
--
-- * audit_log.ts is stored as text ('YYYY-MM-DD HH:MM', see Reportus.html's
--   recordReportView()), not a native timestamp column -- the comparisons
--   above rely on that format sorting correctly as text, which it does for
--   this exact 'YYYY-MM-DD HH:MM' shape. Worth a spot-check against a known
--   old and new row before trusting it at scale.
-- * This plan does not change anything about ongoing writes -- new rows
--   keep landing in audit_log exactly as today; only the one-off copy+trim
--   above is affected. If you want this to run on a schedule (e.g. monthly)
--   rather than as a one-off, say so and it can be wrapped in a Postgres
--   function + pg_cron job instead -- not built here since that's a bigger,
--   standing change and wasn't asked for.
-- * "if not used/redundant" -- if you meant something more specific than
--   "older than N months" (e.g. rows from a known duplicate-write incident,
--   or a particular org, or a particular 'what' action type), say so and
--   this can be narrowed; as written it archives purely by age.
