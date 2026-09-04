-- 2026-09-04: Activity-to-campaign secondary links -- backlog item 12
-- One new table. Purely additive -- tasks.campaign_id stays the single "primary"
-- campaign, untouched. This table only carries EXTRA links for attribution when
-- one activity genuinely serves more than one campaign, mirroring the existing
-- campaign_partner_allocations pattern (role + % share per link).
-- Safe to run multiple times (IF NOT EXISTS guards). Cursus.html already ships
-- with fail-soft loading for this table (see its 2026-09-04 comments), so
-- nothing breaks if this hasn't been run yet -- the "+ Add secondary campaign"
-- control in the Move-activity dialog just won't persist anything until it has.

CREATE TABLE IF NOT EXISTS task_campaign_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  task_id           UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  role              TEXT NOT NULL DEFAULT '',
  budget_share_pct  NUMERIC NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS task_campaign_links_task_idx ON task_campaign_links (task_id);
CREATE INDEX IF NOT EXISTS task_campaign_links_campaign_idx ON task_campaign_links (campaign_id);

ALTER TABLE task_campaign_links ENABLE ROW LEVEL SECURITY;

-- RLS policy -- same caveat as the board_report_notes migration (2026-09-03): no
-- direct visibility into this project's existing RLS policy syntax from this
-- session (no schema/policy file exists in either repo). Mirrors that same
-- reasonable guess -- check it against however campaigns/tasks/deals actually
-- express org isolation and adjust to match before running in production.

CREATE POLICY task_campaign_links_org_isolation ON task_campaign_links
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- Nothing to backfill: every existing task already has its "primary" campaign
-- via tasks.campaign_id, unchanged. This table starts empty and only gets rows
-- when someone actually adds a secondary campaign link from Cursus.html.
