-- Item 41 -- deal-level partner commission/attribution, 2026-09-09
--
-- Answers the open question from item 41's own ledger note: is per-deal commission % a
-- new, finer-grained partner-deal link, or does it reuse the existing partner-campaign
-- allocation? A new link -- campaign_partner_allocations already covers a partner's
-- budget/lead-share across a WHOLE campaign; "sourced this deal, gets X% commission on it"
-- is a different, deal-specific relationship a campaign-level allocation can't express
-- (a campaign can have several deals, each possibly sourced by a different partner, or none).
--
-- Two nullable, additive columns on augur_deals. Safe to run multiple times.

ALTER TABLE augur_deals ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;
ALTER TABLE augur_deals ADD COLUMN IF NOT EXISTS commission_pct numeric;

-- Augur.html already ships with fail-soft loading/saving for these two columns (kept
-- deliberately isolated, outside the shared throw-on-error Promise.all boot batch) --
-- nothing breaks if this hasn't been run yet; the new "Sourced by"/"Commission %" columns
-- on the Deals table just show blank/empty and won't persist until it has.

-- Verification
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='augur_deals' AND column_name IN ('partner_id','commission_pct');
