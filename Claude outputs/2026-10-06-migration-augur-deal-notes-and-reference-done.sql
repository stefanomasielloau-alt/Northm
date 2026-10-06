-- 2026-10-06: Scoring/Deals redesign (Stef) -- backlog item 12(a)
-- Two independent, additive changes, both safe to run multiple times (IF NOT EXISTS guards).
-- Both Augur.html (deal Details panel) and Prospectus.html (Targets > Reference tracking) are
-- already fail-soft for both of these -- nothing breaks if this hasn't run yet, the new UI
-- parts just won't save across a reload until it has.
--
-- (1) New augur_deal_notes table. The Deals table's per-factor score columns moved into a new
--     per-deal "Details" panel (Augur.html), which also lets you keep MULTIPLE free-text notes
--     against a deal -- separate from the single crm_contacts.notes field, and separate from
--     the shared audit_log (that's an automatic record of what changed; these are things a
--     person writes).
--
-- (2) asset_references gets a done/done_at pair. Augur's Details panel shows a deal's linked
--     references (the same rows Targets > Reference tracking already manages -- see
--     2026-09-28-migration-prospectus-references-details-and-deal-link.sql for deal_id) and
--     lets you tick one off once it's actually been used/followed up, with a timestamp.
--     Toggled from either module; both write to the same row.

CREATE TABLE IF NOT EXISTS public.augur_deal_notes (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS augur_deal_notes_deal_idx ON public.augur_deal_notes (deal_id);
CREATE INDEX IF NOT EXISTS augur_deal_notes_org_idx  ON public.augur_deal_notes (org_id);

ALTER TABLE public.augur_deal_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- standard org isolation (same shape as the flows-runtime tables / the new-table template --
  -- note this is a BRAND NEW table, so it never had the old v1/v2 Super Admin bypass policy
  -- that v7 (2026-10-06, confirmed run) had to go back and drop from everything pre-existing).
  DROP POLICY IF EXISTS augur_deal_notes_org_isolation ON public.augur_deal_notes;
  CREATE POLICY augur_deal_notes_org_isolation ON public.augur_deal_notes
    USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
    WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.augur_deal_notes TO authenticated;

ALTER TABLE public.asset_references
  ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS done_at timestamptz;

-- ---------------------------------------------------------------------------------------- verify
SELECT to_regclass('public.augur_deal_notes') AS augur_deal_notes_table;
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='asset_references' AND column_name IN ('done','done_at')
  ORDER BY column_name;
