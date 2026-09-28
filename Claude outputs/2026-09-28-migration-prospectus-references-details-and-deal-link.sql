-- 2026-09-28 -- Targets (Prospectus.html) upgrade: References occurrences + Reference tracking deal link
-- Stef: "for each of Case study, Speaking, Webinar, Testimonial and a new type Reference: a flag,
--        a Notes field, and multiple occurrences" and "Reference tracking should sit in Targets
--        after 5 References ... linked to the associated Deal".
--
-- Adds two nullable columns to EXISTING tables only (no new tables, no data changes):
--   1. prospectus_references.details  jsonb
--        {caseStudy|speaking|webinar|testimonial|reference:
--           {on:bool, notes:text, occ:[{date,name,link,notes}]}}
--      The existing is_* booleans and single-value text columns are unchanged and still written
--      (kept in sync with the flags / each type's most recent occurrence).
--   2. asset_references.deal_id  uuid  -- the Deal (augur_deals.id) a reference supports.
--      Same table Assets used for "Reference tracking"; the page now lives in Targets.
--
-- Idempotent. Both tables already have RLS + org-isolation policies and authenticated grants
-- (existing tables), so no policy / grant changes are needed for new columns.
-- Prospectus.html is fail-soft until this runs: it probes each column at load and simply doesn't
-- send it (showing a "Run migration ..." note) when absent.

BEGIN;

ALTER TABLE public.prospectus_references ADD COLUMN IF NOT EXISTS details jsonb;
ALTER TABLE public.asset_references      ADD COLUMN IF NOT EXISTS deal_id uuid;

-- Optional FK: only added if augur_deals.id is a uuid and the constraint doesn't exist yet.
-- ON DELETE SET NULL so deleting a deal never deletes a reference.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='augur_deals' AND column_name='id' AND data_type='uuid')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asset_references_deal_id_fkey') THEN
    ALTER TABLE public.asset_references
      ADD CONSTRAINT asset_references_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.augur_deals(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS asset_references_deal_id_idx ON public.asset_references(deal_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
