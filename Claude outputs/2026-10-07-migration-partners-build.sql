-- Partners relocation: commission/attribution/licensing build (item 9 extension)
-- Design locked by Stef 2026-10-07 -- see
-- claude/2026-09-07-partners-configuration-and-licensing-currency-proposal.md's final
-- section for the full reasoning. Covers decisions 3-5 (decisions 1 and 2, visibility in
-- both Cursus/CampaignPlanning + Configuration, and admin-editable partner types, are both
-- UI-only changes against data that already exists -- the partners table itself, and
-- org_settings.partner_type_presets, which CampaignPlanning's Partners page already reads
-- and writes. An earlier draft of this migration added a brand-new partner_types table for
-- decision 2 before re-reading CampaignPlanning.html closely enough to notice that list
-- already lives on org_settings -- removed here before it shipped, to avoid two competing
-- sources of truth for the same list).
--
-- Safe to run multiple times.

BEGIN;

-- Decision 3+4: partner-level default commission % (manual entry now; the column is a
-- plain numeric so a future automated/"agreement" source could populate it later with no
-- schema change, per Stef's "in future will pull from external or based on preset
-- agreements"). The per-deal override column (augur_deals.commission_pct) already exists
-- (item 41, 2026-09-09) -- this just adds where the default comes FROM.
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS default_commission_pct numeric;

-- Decision 4 (the "sourced to" field, originally item F in the proposal): did the partner
-- source this deal themselves, or were they added onto a deal the house (an internal rep)
-- or another partner sourced. House-sourced attribution reuses the deal's own existing
-- owner field -- no new column needed for that side. attribution_credited_to_partner_id is
-- only set for the co-sell-to-another-partner case.
ALTER TABLE public.augur_deals ADD COLUMN IF NOT EXISTS attribution_source text
  CHECK (attribution_source IN ('partner_sourced','house_sourced'));
ALTER TABLE public.augur_deals ADD COLUMN IF NOT EXISTS attribution_credited_to_partner_id uuid
  REFERENCES public.partners(id) ON DELETE SET NULL;

-- Decision 5: licensing currency + locked-at-signing floor OR floating re-conversion.
-- licensing_mode is a PER-DEAL choice (a dropdown on the deal itself, not an org-wide
-- setting) -- flagged back to Stef as the one call made without his explicit sign-off,
-- since his proposal doc left this as the one remaining open sub-question. Easy to add an
-- org-wide default on top of this later without a schema change if he'd rather that.
ALTER TABLE public.augur_deals ADD COLUMN IF NOT EXISTS licensing_currency text;
ALTER TABLE public.augur_deals ADD COLUMN IF NOT EXISTS licensing_mode text
  CHECK (licensing_mode IN ('locked','floating'));
-- Locked-mode snapshot, taken once at signing, never re-written afterward:
ALTER TABLE public.augur_deals ADD COLUMN IF NOT EXISTS licensing_locked_rate numeric;
ALTER TABLE public.augur_deals ADD COLUMN IF NOT EXISTS licensing_locked_base_aud numeric;
ALTER TABLE public.augur_deals ADD COLUMN IF NOT EXISTS licensing_signed_at date;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verification:
-- SELECT id, name, type, default_commission_pct FROM public.partners;
-- SELECT column_name FROM information_schema.columns WHERE table_name='augur_deals'
--   AND (column_name LIKE 'attribution_%' OR column_name LIKE 'licensing_%');
