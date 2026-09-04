-- 2026-09-04: Board report snapshot history -- backlog item 17
-- One new table. Safe to run multiple times (IF NOT EXISTS guards).
--
-- Deliberately NOT the same table as the general "snapshots" table used on the Snapshots page.
-- That table captures the WHOLE plan and is revertible (revertSnapshot() in Ordo.html swaps
-- the entire live CFG back in). Mixing a small board-report-only payload into that same list
-- would let someone "revert" to one by mistake and wipe out their entire live plan. This table
-- is read-only history instead -- just the already-computed report payload, nothing you can
-- revert the plan to.

CREATE TABLE IF NOT EXISTS board_report_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  fy          TEXT NOT NULL,
  name        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_report_snapshots_org_fy_idx ON board_report_snapshots (org_id, fy);

ALTER TABLE board_report_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policy -- same caveat as board_report_notes and task_campaign_links before it: no direct
-- visibility into this project's existing RLS policy syntax from this session. Mirrors that
-- same reasonable guess -- check against how campaigns/tasks/deals actually express org
-- isolation and adjust to match before relying on it in production.

CREATE POLICY board_report_snapshots_org_isolation ON board_report_snapshots
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- Ordo.html already ships with fail-soft loading for this table (its 2026-09-04 comments) --
-- nothing breaks if this hasn't been run yet, the Board report's history dropdown just shows
-- "Live (current)" only and "Save this report to history" won't persist until it has.
