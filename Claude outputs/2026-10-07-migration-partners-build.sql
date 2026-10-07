-- Partners relocation + commission/attribution/licensing build (item 9 extension)
-- Design locked by Stef 2026-10-07 -- see
-- claude/2026-09-07-partners-configuration-and-licensing-currency-proposal.md's final
-- section for the full reasoning. Covers decisions 2-5 (decision 1, visibility in both
-- Cursus/CampaignPlanning and Configuration, is a UI-only change, no schema needed).
--
-- Safe to run multiple times.

BEGIN;

-- Decision 2: partner type, fully admin-editable (same shape as budget_line_categories /
-- cost_buckets). partners.type itself stays a plain text column (like cost_buckets.dept) --
-- not a strict FK -- so existing partner rows never need touching; the admin screen's
-- dropdown is just populated from this list.
CREATE TABLE IF NOT EXISTS public.partner_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_types_org_isolation ON public.partner_types;
CREATE POLICY partner_types_org_isolation ON public.partner_types
  USING (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE profiles.id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_types TO service_role;

-- Seed a starter list + one sample partner per org, per Stef's "seed one sample partner"
-- instruction (decision 2). Guarded by NOT EXISTS, safe to re-run.
INSERT INTO public.partner_types (org_id, name, sort_order)
SELECT o.id, t.name, t.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('Reseller',1), ('Referral',2), ('Technology',3), ('Agency',4)
) AS t(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_types pt WHERE pt.org_id = o.id AND pt.name = t.name
);

INSERT INTO public.partners (org_id, name, type, contact_name, contact_email, contact_phone, notes)
SELECT o.id, 'Sample Partner Co', 'Reseller', '', '', '', 'Seeded example -- edit or remove freely.'
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.partners p WHERE p.org_id = o.id)
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partners' AND column_name='org_id');

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
-- SELECT * FROM public.partner_types ORDER BY org_id, sort_order;
-- SELECT id, name, type, default_commission_pct FROM public.partners;
-- SELECT column_name FROM information_schema.columns WHERE table_name='augur_deals'
--   AND column_name LIKE 'attribution_%' OR column_name LIKE 'licensing_%';
