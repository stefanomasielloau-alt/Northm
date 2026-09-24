-- 2026-09-24 -- Custom / external widgets table (Stef: "Where is the Library config page so I
-- can go and curate including ADDING External Widgets/connectors etc").
--
-- v2: the first version of this file referenced a table named "orgs" that doesn't exist in
-- this schema (Stef's own error: 42P01: relation "orgs" does not exist) -- guessed wrong
-- without checking. Confirmed this time against the actual repo: the real table is
-- "organizations" (used throughout Ordo.html/Norma.html's own queries), and the RLS policy
-- below is copied verbatim in shape from the two most recent real additive-table migrations
-- in this repo (region_gate_rates / region_streams, both 2026-09-22) rather than guessed --
-- same auth.uid() -> profiles.org_id join, same USING + WITH CHECK, same
-- "<table>_org_isolation" naming convention.
--
-- Backs a new per-org "External widgets" section in the Strategy-wide widget library (Admin &
-- config > Widget library) -- each row is one custom tile a person can then add to any grid page
-- via the existing "+ Add tile" picker, same as any of the 108 built-in widgets. Org-scoped like
-- activities/streams/segments/etc, not global like Regions/Pods.
--
-- Ordo.html's load code treats this the same fail-soft way it already treats
-- region_gate_rates/region_streams/board_report_notes -- if this migration hasn't run yet in a
-- given environment, CFG.customWidgets simply loads empty (no error, no broken boot) and the
-- Widget library page's External widgets section just shows none yet.
--
-- `type` is deliberately just 'iframe' for this first pass -- the simplest, most universal way
-- to embed something external (any URL that allows framing renders as-is, no per-vendor
-- integration code needed). Kept as its own column, not hardcoded, so a second type (e.g. an
-- API-polling data card, or a webhook-fed panel) can be added later without a schema change.

BEGIN;

CREATE TABLE IF NOT EXISTS custom_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category_page_id text, -- which existing page/tab this files under in the library browser (e.g. 'geo'); null = its own "External widgets" category only
  hint text DEFAULT '',
  type text NOT NULL DEFAULT 'iframe',
  url text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE custom_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_widgets_org_isolation ON custom_widgets
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

COMMIT;

-- Not executed by this session -- prepared for Stef to review and run himself, per standing
-- process.
