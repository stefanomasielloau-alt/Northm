-- 2026-09-03: Board Report Commentary -- item 16 follow-up
-- One new table. Safe to run multiple times (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS board_report_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  fy                TEXT NOT NULL,
  note              TEXT NOT NULL,
  visible_in_output BOOLEAN NOT NULL DEFAULT false,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_report_notes_org_fy_idx ON board_report_notes (org_id, fy);

ALTER TABLE board_report_notes ENABLE ROW LEVEL SECURITY;

-- RLS policy -- IMPORTANT CAVEAT:
-- I don't have direct visibility into this project's existing RLS policy
-- syntax for other org-scoped tables (no schema/policy file exists in either
-- repo -- confirmed via a repo-wide search that turned up nothing but this
-- session's own one-off migration files). The policy below is a reasonable
-- guess at the shape ("a person can read/write notes for their own org,
-- looked up via profiles.org_id") but you should check it against however
-- your other org-scoped tables (campaigns, deals, events, assets) actually
-- express that same check, and adjust to match before running this in
-- production. If an existing policy on one of those tables uses a different
-- helper function or column name, mirror that instead of this guess.

CREATE POLICY board_report_notes_org_isolation ON board_report_notes
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));
