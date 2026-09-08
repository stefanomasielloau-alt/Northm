-- 2026-09-08: Hub -> North campaign execution push -- backlog item 11.
-- One new table. Safe to run multiple times (IF NOT EXISTS guards).
--
-- Spec: claude/2026-09-04-hub-to-north-campaign-push-spec.md (written before
-- today's build session). Stef's answers there plus today's live confirmation:
--   - Link is by campaign NAME only (exact, case-sensitive), matching
--     Hub/Queue contact.wave -> North campaigns.name. No FK-only relationship
--     is possible since the two systems are separate databases.
--   - "Executed" = the campaign has been started (any Hub/Queue activity
--     against it) OR completed -- a one-way not-started -> executed flip,
--     not a three-state progress tracker.
--   - Counters: sent / responded / connected map onto real Hub/Queue data
--     (sent = an outreach record exists; responded = status = 'Replied';
--     connected = status has moved past 'Connection Pending'). opened /
--     clicked have NO Hub/LinkedIn equivalent -- kept as columns for
--     schema-compatibility with the original spec, but Hub-Backend always
--     writes NULL for them; Cursus.html renders them as "n/a", not 0.
--   - Conflict handling: manual (a person decides, never auto-resolved).
--     conflict_flag is included per spec but Hub-Backend does NOT yet set
--     it automatically -- see the comment in Hub-Backend/sync.py for why
--     (campaigns has no updated_at column to compare against yet, and
--     adding one is a separate decision on a live, heavily-used table).
--     Flagged to Stef rather than guessed at.

CREATE TABLE IF NOT EXISTS campaign_execution_status (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id),
  campaign_id           UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_name_matched TEXT NOT NULL,
  executed              BOOLEAN NOT NULL DEFAULT false,
  executed_at           TIMESTAMPTZ,
  sent_count            INTEGER NOT NULL DEFAULT 0,
  opened_count          INTEGER,
  clicked_count         INTEGER,
  responded_count       INTEGER NOT NULL DEFAULT 0,
  connected_count       INTEGER NOT NULL DEFAULT 0,
  last_synced_at        TIMESTAMPTZ,
  conflict_flag         BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, campaign_name_matched)
);

CREATE INDEX IF NOT EXISTS campaign_execution_status_org_idx ON campaign_execution_status (org_id);
CREATE INDEX IF NOT EXISTS campaign_execution_status_campaign_idx ON campaign_execution_status (campaign_id);

ALTER TABLE campaign_execution_status ENABLE ROW LEVEL SECURITY;

-- Same RLS shape as board_report_snapshots/task_campaign_links before it.
-- Hub-Backend writes these rows using the Supabase service-role key (which
-- bypasses RLS entirely), so this policy only governs what North's own
-- signed-in users can see/change directly -- read for anyone in the org,
-- write allowed too (needed for the "Review & clear" conflict action,
-- which just flips conflict_flag back to false).

CREATE POLICY campaign_execution_status_org_isolation ON campaign_execution_status
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- Cursus.html ships with fail-soft loading for this table -- nothing breaks
-- if this hasn't been run yet, campaign cards just show no execution badge.
