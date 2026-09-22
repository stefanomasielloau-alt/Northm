-- North V2 / Ordo (Strategy) — Gap 3: per-region stream mix + Region × stream crosstab
-- Run this once in Supabase's SQL editor for the North project.
--
-- What this does:
--   One new junction table, same shape as Gap 2's region_gate_rates. Global stream mix
--   stays exactly where it is (public.streams.mix, edited in Admin & config > Streams).
--   This table only ever holds a row for a (region, stream) combination someone has
--   explicitly overridden in Geography & pods — no row = that region just uses the
--   global mix for that stream, so every existing region behaves identically to today
--   the moment this ships. Nothing to backfill.
--
-- What this unlocks in Ordo.html (already built, ships in the same commit as this
-- migration is delivered):
--   - A "Stream mix override" card per region on Geography & pods — global mix, that
--     region's own mix (editable, blank = inherit), and a reset-to-global link. Same
--     interaction pattern as Gap 2's rate override, just for mix instead of rate.
--   - A "Region × stream funnel" table — the actual screenshot-matching deliverable —
--     showing every region crossed with every stream, at every gate (not just wins),
--     using that region's own mix where it has one.
--
-- Who can write: same canWriteRegion() permission model as Gap 2 and everything else
-- on this page. No new permission concept.
--
-- Pattern: copied from this project's existing task_campaign_links migration
-- (2026-09-04) / Gap 2's region_gate_rates migration — same org-isolation RLS shape
-- used across this project. Adjust to match your actual RLS policy syntax if it
-- differs from that template by the time you run this.
--
-- Safety: additive only, IF NOT EXISTS guarded, safe to run more than once.
-- Ordo.html already ships with fail-soft loading for this table (same technique as
-- region_gate_rates) — nothing breaks if this hasn't been run yet; the region stream
-- mix inputs on Geography & pods just won't persist anything until it has.

CREATE TABLE IF NOT EXISTS region_streams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  region_id   UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  stream_id   UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  mix         NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, stream_id)
);

CREATE INDEX IF NOT EXISTS region_streams_region_idx ON region_streams (region_id);
CREATE INDEX IF NOT EXISTS region_streams_stream_idx ON region_streams (stream_id);

ALTER TABLE region_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY region_streams_org_isolation ON region_streams
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- Nothing to backfill — table starts empty, every region keeps using the global
-- stream mix exactly as it does today until someone overrides a stream for that
-- region in Geography & pods.
