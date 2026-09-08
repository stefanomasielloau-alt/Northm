-- 2026-09-08 (cont'd): Bodgit&Scarpa was still showing empty in Custodia
-- (Assets), Augur (Scoring), Eventus (Events), and Prospectus (Targets) --
-- Stef reported "Assets has nothing etc" live. Root cause, confirmed by
-- checking exactly what tonight's earlier seed file
-- (2026-09-08-bodgit-scarpa-full-seed.sql) actually inserted: it covered
-- ONLY Ordo/Cursus tables (regions, cost_buckets, programmes, campaigns,
-- tasks) -- it never touched assets/augur_deals/eventus_events/
-- prospectus_filters at all. This file fills that specific gap.
--
-- (There is also an older 2026-09-03-north-test-data-seed.sql that DOES
-- cover these 4 tables for this same org -- worth checking if that one
-- ever actually got run; if it did, you may end up with two sets of demo
-- rows, which is harmless but worth knowing. This file does not assume
-- either way and uses its own distinct tracking_ref so it can't collide.)
--
-- Same Winnie-the-Pooh convention as tonight's other Bodgit&Scarpa seed
-- files, tracking_ref='demo-bg-2026-09-08-v2' (distinct from the earlier
-- 'demo-bg-2026-09-08-t1' tasks tag) so this batch can be found/removed
-- independently. campaign_id deliberately left NULL everywhere (no live
-- ID lookup was available when writing this) -- campaign_ref/source
-- carry the narrative link as free text instead, same pattern the
-- 2026-09-03 seed already used for the same reason.
--
-- FOR REVIEW ONLY. Nothing runs automatically. Same BEGIN/COMMIT +
-- Step 0 sanity check convention as every other seed this project.

-- STEP 0: confirm the org exists and see current row counts before/after.
SELECT id, name FROM organizations WHERE name = 'Bodgit&Scarpa';

SELECT
  (SELECT count(*) FROM assets a JOIN organizations o ON o.id=a.org_id WHERE o.name='Bodgit&Scarpa') AS assets,
  (SELECT count(*) FROM augur_deals d JOIN organizations o ON o.id=d.org_id WHERE o.name='Bodgit&Scarpa') AS augur_deals,
  (SELECT count(*) FROM eventus_events e JOIN organizations o ON o.id=e.org_id WHERE o.name='Bodgit&Scarpa') AS eventus_events,
  (SELECT count(*) FROM prospectus_filters p JOIN organizations o ON o.id=p.org_id WHERE o.name='Bodgit&Scarpa') AS prospectus_filters;

-- STEP 1 (review the block below before running Step 2)

-- STEP 2: the actual seed. BEGIN/COMMIT so a failure partway rolls back
-- cleanly with nothing partially written, same as every other seed file.
BEGIN;

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Bodgit&Scarpa';
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Bodgit&Scarpa org not found -- aborting, nothing inserted.';
  END IF;

  -- Assets (Custodia) -- 6 rows, 2 deliberately below their low_stock_at
  -- threshold so Custodia's own "low stock" KPI/filter has something real
  -- to show, matching this project's established seeding convention.
  INSERT INTO assets (id, org_id, name, category, tags, stock, low_stock_at, cost_per, purchase_date, location, notes, tracking_ref) VALUES
    (gen_random_uuid(), v_org_id, 'Honey Jar branded gift sets', 'Merchandise', ARRAY['event','gift'], 8, 15, 22.50, CURRENT_DATE - 30, 'ANZ warehouse', 'Example asset -- safe to delete.', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Pop-up banner: Hundred Acre Trading Co', 'Signage', ARRAY['event'], 40, 10, 0, CURRENT_DATE - 90, 'ANZ warehouse', 'Example asset -- safe to delete.', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Webinar hosting licence (annual)', 'Software', ARRAY['events','content'], 3, 5, 1200, CURRENT_DATE - 200, 'N/A (digital)', 'Example asset -- safe to delete.', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Piglet plush conference giveaway', 'Merchandise', ARRAY['event','gift'], 5, 20, 8.00, CURRENT_DATE - 10, 'ANZ warehouse', 'Example asset -- safe to delete. Below low-stock threshold on purpose.', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Case study template pack', 'Content', ARRAY['content'], 25, 5, 0, CURRENT_DATE - 60, 'N/A (digital)', 'Example asset -- safe to delete.', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Owl webinar backdrop (physical)', 'Signage', ARRAY['events'], 2, 4, 350, CURRENT_DATE - 15, 'SEA warehouse', 'Example asset -- safe to delete. Below low-stock threshold on purpose.', 'demo-bg-2026-09-08-v2');

  -- Deals (Augur / Scoring) -- 6 rows, one per pipeline stage, mixed
  -- currencies (same convention as the 2026-09-03 seed) so multi-currency
  -- display can be exercised too.
  INSERT INTO augur_deals (id, org_id, name, account, value, currency, stage, close_date, source, campaign_ref, tracking_ref) VALUES
    (gen_random_uuid(), v_org_id, 'Hundred Acre Trading Co -- honey subscription upsell', 'Hundred Acre Trading Co', 15000, 'AUD', 'Qualification', CURRENT_DATE + 30, 'Inbound', 'Honey Jar Launch Campaign', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Woodland Distribution Partners -- channel deal', 'Woodland Distribution Partners', 42000, 'USD', 'Proposal', CURRENT_DATE + 20, 'Partner referral', 'Kanga & Roo Referral Programme', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Bouncy Retail Group -- social-led enquiry', 'Bouncy Retail Group', 9000, 'AUD', 'Negotiation', CURRENT_DATE + 10, 'Social', 'Bouncy Tigger Social Blitz', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Owl Consulting -- webinar attendee follow-up', 'Owl Consulting', 6000, 'AUD', 'Closed Won', CURRENT_DATE - 5, 'Webinar', 'Wise Owl Webinar Series', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Eeyore & Co -- retention renewal', 'Eeyore & Co', 3500, 'GBP', 'Closed Lost', CURRENT_DATE - 15, 'Existing customer', 'Eeyore Customer Retention Drive', 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Piglet Partner Supplies -- enablement kit trial', 'Piglet Partner Supplies', 12000, 'AUD', 'Qualification', CURRENT_DATE + 45, 'Outbound', 'Piglet Partner Enablement Kit', 'demo-bg-2026-09-08-v2');

  -- Events (Eventus) -- 5 rows, one per status, so status-based
  -- filters/KPIs have real examples across the board.
  INSERT INTO eventus_events (id, org_id, name, type, status, start_date, end_date, country, venue, location, pax, requester, campaign_ref, budget, registered, attended, tracking_ref) VALUES
    (gen_random_uuid(), v_org_id, 'Wise Owl Webinar: Season 1 Launch', 'Webinar', 'Completed', CURRENT_DATE - 20, CURRENT_DATE - 20, 'Australia', 'Online', 'Online', 150, 'Owl', 'Wise Owl Webinar Series', 2000, 180, 142, 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Honey Jar Launch Party', 'In-person', 'Planned', CURRENT_DATE + 15, CURRENT_DATE + 15, 'Australia', 'Sydney showroom', 'Sydney, NSW', 60, 'Winnie Pooh', 'Honey Jar Launch Campaign', 8000, 22, 0, 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Bouncy Tigger Trade Show Booth', 'Trade show', 'Confirmed', CURRENT_DATE + 30, CURRENT_DATE + 32, 'Singapore', 'Marina Bay Expo', 'Singapore', 500, 'Tigger', 'Bouncy Tigger Social Blitz', 15000, 0, 0, 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Piglet Partner Enablement Workshop', 'Workshop', 'Draft', CURRENT_DATE + 60, CURRENT_DATE + 60, 'Australia', 'TBD', 'TBD', 30, 'Piglet', 'Piglet Partner Enablement Kit', 3000, 0, 0, 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Eeyore Retention Roundtable', 'In-person', 'Cancelled', CURRENT_DATE - 5, CURRENT_DATE - 5, 'Australia', 'Melbourne office', 'Melbourne, VIC', 20, 'Eeyore', 'Eeyore Customer Retention Drive', 1500, 8, 0, 'demo-bg-2026-09-08-v2');

  -- ICP filters (Prospectus / Targets) -- 2 rows, showing the full field
  -- set including company size/target titles/seniority (item 13).
  INSERT INTO prospectus_filters (id, org_id, name, industry, what_you_sell, ideal_client, deal_value, currency, market, country, company_size, target_titles, seniority, tracking_ref) VALUES
    (gen_random_uuid(), v_org_id, 'Honey & specialty foods retailers', 'Retail & FMCG', 'Branded honey jars and specialty food gift sets', 'Boutique and mid-size specialty food retailers wanting a distinctive, story-led gift range', 15000, 'AUD', 'ANZ', 'Australia', '51-200', 'Buyer, Category Manager, Head of Merchandising', ARRAY['Manager','Head','Director'], 'demo-bg-2026-09-08-v2'),
    (gen_random_uuid(), v_org_id, 'Corporate gifting & partner channel', 'Professional services', 'Partner enablement kits and corporate gifting programmes', 'Mid-market firms running a formal partner or channel programme needing a gifting/enablement vendor', 40000, 'AUD', 'APAC', 'Singapore', '201-500', 'Head of Partnerships, Channel Manager', ARRAY['Director','VP'], 'demo-bg-2026-09-08-v2');

END $$;

COMMIT;

-- STEP 3 (after running): re-run the Step 0 count query above to confirm
-- assets=6, augur_deals=6, eventus_events=5, prospectus_filters=2 (plus
-- whatever the 2026-09-03 seed may have already added, if it was run).
