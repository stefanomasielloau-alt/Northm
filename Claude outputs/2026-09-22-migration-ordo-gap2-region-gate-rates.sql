-- North V2 / Ordo (Strategy) -- Gap 2: per-region gate-rate overrides
-- Run this once in Supabase's SQL editor for the North project.
--
-- What this does:
--   One new junction table. Global gate rates stay exactly where they are today
--   (public.gates.rate, edited in Drivers > Rate library). This table only ever
--   holds a row for a (region, gate) combination someone has explicitly
--   overridden in Geography & pods. No row = that region just uses the global
--   rate, so every existing region behaves identically to today the moment
--   this ships -- nothing to backfill, nothing changes on screen until a
--   planner or admin types a number in.
--
-- Who can write: enforced in the app the same way region ACV targets and pod
-- shares already are (canWriteRegion()) -- a platform admin, a role with
-- write-all/all-scope, or a user whose own region list includes that region.
-- No new permission concept introduced.
--
-- Pattern: copied from this project's existing task_campaign_links migration
-- (2026-09-04) -- same org-isolation RLS shape used across this project. If
-- this project's actual RLS policy syntax differs from that template by the
-- time you run this, adjust to match before running in production.
--
-- Safety: additive only, IF NOT EXISTS guarded, safe to run more than once.
-- Ordo.html already ships with fail-soft loading for this table (see its
-- 2026-09-22 comments in the boot sequence) -- nothing breaks if this hasn't
-- been run yet; the region override inputs on Geography & pods just won't
-- persist anything until it has.

CREATE TABLE IF NOT EXISTS region_gate_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  region_id   UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  gate_id     UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  rate        NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, gate_id)
);

CREATE INDEX IF NOT EXISTS region_gate_rates_region_idx ON region_gate_rates (region_id);
CREATE INDEX IF NOT EXISTS region_gate_rates_gate_idx ON region_gate_rates (gate_id);

ALTER TABLE region_gate_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY region_gate_rates_org_isolation ON region_gate_rates
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

-- Nothing to backfill -- table starts empty, every region keeps using the
-- global rate curve exactly as it does today until someone overrides a gate
-- for that region in Geography & pods.
