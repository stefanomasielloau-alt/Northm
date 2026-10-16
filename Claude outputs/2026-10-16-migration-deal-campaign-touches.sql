-- 2026-10-16 "Contribution to closed pipeline" KPI (Stef's answers: Closed Won only, multi-touch credit, org base
-- currency, partner-sourced vs marketing-sourced reported separately, tile on the Board report by default).
-- Spec: claude/2026-10-10-contribution-to-closed-pipeline-kpi-spec.md (MarPlan tool project).
--
-- (1) deal_campaign_touches: extra campaigns that touched a deal (multi-touch). The deal's own campaign
--     (augur_deals.campaign_id) stays the SOURCED campaign; rows here add INFLUENCED campaigns (or override the
--     sourced campaign's weight). Credit for a Closed Won deal is shared across its campaigns in proportion to the
--     weights -- the deal's value is never counted twice.
-- (2) org_settings.attribution_model: 'multi_touch' (default, Stef 16 Oct) or 'sourced_only'.
-- Additive, safe to run more than once. Rollback: 2026-10-16-migration-deal-campaign-touches-ROLLBACK.sql
-- North pages are fail-soft until this runs (the tile shows sourced-only credit and says the update is pending).

CREATE TABLE IF NOT EXISTS public.deal_campaign_touches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id     uuid NOT NULL REFERENCES public.augur_deals(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'influenced' CHECK (role IN ('sourced','influenced')),
  weight      numeric NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 100),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  UNIQUE (deal_id, campaign_id)
);
CREATE INDEX IF NOT EXISTS deal_campaign_touches_org_idx ON public.deal_campaign_touches (org_id);
CREATE INDEX IF NOT EXISTS deal_campaign_touches_deal_idx ON public.deal_campaign_touches (deal_id);

ALTER TABLE public.deal_campaign_touches ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  DROP POLICY IF EXISTS deal_campaign_touches_org_isolation ON public.deal_campaign_touches;
  CREATE POLICY deal_campaign_touches_org_isolation ON public.deal_campaign_touches
    USING (org_id IN (SELECT org_id FROM public.profiles WHERE profiles.id = auth.uid()) OR public.is_platform_admin())
    WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE profiles.id = auth.uid()) OR public.is_platform_admin());
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_campaign_touches TO authenticated;

ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS attribution_model text NOT NULL DEFAULT 'multi_touch';
DO $$ BEGIN
  ALTER TABLE public.org_settings ADD CONSTRAINT org_settings_attribution_model_chk CHECK (attribution_model IN ('multi_touch','sourced_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- verify
SELECT to_regclass('public.deal_campaign_touches') AS touches_table,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='org_settings' AND column_name='attribution_model') AS attribution_model_column;
