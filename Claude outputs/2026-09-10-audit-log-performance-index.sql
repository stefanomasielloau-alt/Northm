-- Audit log performance fix -- 2026-09-10
--
-- Every module's boot load runs this exact query on every page view, for every user,
-- in every org:
--
--   sb.from('audit_log').select(...).eq('org_id', <org>).order('ts', {ascending:false}).limit(200)
--
-- With ~398k rows and no index on ts, that ORDER BY forces a full sort of the whole
-- table (or at least the whole org's slice of it) on every single page load -- which is
-- why it's now timing out (Postgres error 57014) rather than just being slow. This is
-- not just a forensics-query problem; it is the live page-load path for the entire app.
--
-- Fix: one composite index matching the exact WHERE + ORDER BY shape above. This lets
-- Postgres walk the index in the right order for a given org and stop at 200 rows,
-- instead of sorting everything first.
--
-- Safe to run any time -- CONCURRENTLY avoids taking a write lock on audit_log while the
-- index builds (important given the table's size and that it's under constant insert
-- traffic). CONCURRENTLY cannot run inside a transaction block, so run this statement on
-- its own (most SQL editors, including Supabase's, already do this one statement at a
-- time).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_org_ts
  ON audit_log (org_id, ts DESC);

-- Verification -- should return in well under a second once the index is built, and the
-- query plan should show "Index Scan using idx_audit_log_org_ts" rather than a Sort node.
-- Swap in a real org_id from your own data before running.
--
-- EXPLAIN ANALYZE
-- SELECT ts, what, detail FROM audit_log
-- WHERE org_id = '<some org uuid>'
-- ORDER BY ts DESC
-- LIMIT 200;

-- ---------------------------------------------------------------------------------------
-- This index fixes the SPEED problem. It does not address the underlying SIZE problem --
-- ~398k rows (and growing on every save, across every org) is a separate, longer-term
-- decision that only Stef should make, not something to act on unilaterally:
--
--   1. Retention window -- e.g. keep 12 months of detail, roll anything older into a
--      once-a-quarter summary row (or drop it), so the table stops growing indefinitely.
--   2. Archive-then-delete -- copy old rows to a cold-storage table/export first, only
--      delete from the live table once that's confirmed, matching this project's own
--      "never delete without an archived copy" convention.
--   3. Do nothing beyond this index -- if 200-row recent-activity lookups are all the
--      app ever needs (true today), the growing table doesn't hurt read performance once
--      it's indexed; it only costs storage. This may be the simplest right answer.
--
-- No action taken on this second question -- flagging it for Stef's decision, not guessing.
