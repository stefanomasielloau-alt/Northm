-- "Confidence level per deal" (backlog item, confirmed wanted 2026-10-07) -- a manual,
-- per-deal attribute distinct from the existing "Decay / confidence" SCORING FACTOR
-- (CFG.scoringFactors, type:'decay'). That factor feeds into the deal's weighted score
-- like any other factor, with its own weight %. This is different: a standalone estimate
-- Stef sets directly on the deal itself, independent of the scoring model.
--
-- One nullable, additive column on augur_deals. Safe to run multiple times.
--
-- Scope decision flagged back to Stef, not guessed at here: this column is loaded/shown/
-- saved on the Deal Details panel but does NOT currently feed dealMetrics()'s
-- weightedValue calculation (value * tier.probability, from the automatic score->tier
-- lookup -- see Augur.html's dealMetrics()). If he wants the manual confidence level to
-- override or blend with the automatic tier probability for weighted-value/forecasting
-- purposes, that's a separate follow-up change to dealMetrics() once he confirms which
-- behaviour he wants.

ALTER TABLE augur_deals ADD COLUMN IF NOT EXISTS confidence_level integer;
-- 0-100 (a percentage), nullable. No CHECK constraint added -- Augur.html's input clamps
-- to 0-100 client-side; left unconstrained in the DB in case Stef later wants it to mean
-- something else (e.g. a 1-5 scale) without a migration to loosen it again.

-- Augur.html ships with fail-soft loading/saving for this column (added to the same
-- isolated partner_id/commission_pct probe already in place since item 41 -- see
-- 2026-09-09-item41-deal-partner-commission-migration.sql), outside the shared
-- throw-on-error Promise.all boot batch. Nothing breaks if this hasn't been run yet; the
-- new "Confidence level" field on the Deal Details panel just shows blank and won't
-- persist until it has.

-- Verification
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='augur_deals' AND column_name='confidence_level';
