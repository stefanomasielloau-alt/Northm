-- 2026-09-08 (backlog item 5, North side): auto-seed a brand-new organization
-- with a small, immediately-usable set of example data the moment it's
-- created, so a client can log in and see something real instead of a
-- totally blank shell. Fictitious, Winnie-the-Pooh-themed, same convention
-- as tonight's manual Bodgit&Scarpa seed -- this is that same idea, made
-- automatic and reusable for every future org via a trigger rather than a
-- one-off SQL file.
--
-- Deliberately LIGHT -- a welcome foundation (3 regions, 5 standard cost
-- buckets, 1 programme, 2 campaigns, 3 tasks), not the full manual seed's
-- volume. A brand-new org getting a giant fictitious dataset dumped on it
-- would be as confusing as an empty one; this is meant to be small enough
-- to obviously be a "starter kit" (clearly named/dated) that a real org
-- admin would delete once they've seen how it works, not mistake for real
-- content.
--
-- Trigger-based (fires on organizations INSERT), not app-code-based, on
-- purpose: this project has an established pattern this session of using
-- DB-level triggers for anything that must apply no matter which code path
-- creates the row (see item 39's roles.org_id guard) -- an org can be
-- created from Norma.html's "Add organization" button, a script, or
-- directly in Supabase's table editor, and all three get seeded the same
-- way with zero app-code coordination needed.

CREATE OR REPLACE FUNCTION seed_new_organization()
RETURNS trigger AS $$
DECLARE
  v_region_anz uuid := gen_random_uuid();
  v_region_sea uuid := gen_random_uuid();
  v_region_unassigned uuid := gen_random_uuid();
  v_bucket_content uuid := gen_random_uuid();
  v_bucket_paidmedia uuid := gen_random_uuid();
  v_bucket_events uuid := gen_random_uuid();
  v_bucket_email uuid := gen_random_uuid();
  v_bucket_agency uuid := gen_random_uuid();
  v_programme uuid := gen_random_uuid();
  v_campaign1 uuid := gen_random_uuid();
  v_campaign2 uuid := gen_random_uuid();
BEGIN
  INSERT INTO regions (id, org_id, name) VALUES
    (v_region_anz, NEW.id, 'ANZ'),
    (v_region_sea, NEW.id, 'SEA'),
    (v_region_unassigned, NEW.id, 'Unassigned');

  INSERT INTO cost_buckets (id, org_id, code, label) VALUES
    (v_bucket_content,   NEW.id, 'CONTENT',   'Content & creative'),
    (v_bucket_paidmedia, NEW.id, 'PAIDMEDIA', 'Paid media & advertising'),
    (v_bucket_events,    NEW.id, 'EVENTS',    'Events & sponsorship'),
    (v_bucket_email,     NEW.id, 'EMAIL',     'Email & marketing automation'),
    (v_bucket_agency,    NEW.id, 'AGENCY',    'Agency & contractor fees');

  INSERT INTO programmes (id, org_id, name, owner, focus, status, tracking_ref) VALUES
    (v_programme, NEW.id, 'Starter Programme (example -- safe to delete)', 'Winnie Pooh', 'Demand generation', 'Active', 'auto-seed-example');

  INSERT INTO campaigns (
    id, org_id, name, programme_id, region_id, cost_bucket_id,
    start_date, end_date, budget, signoff_status, period_type, period_label,
    tracking_ref, business_case, owner_name, owner_email, sort_order
  ) VALUES
    (v_campaign1, NEW.id, 'Example Campaign: Honey Jar Launch (safe to delete)',
     v_programme, v_region_anz, v_bucket_paidmedia,
     CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', 20000, 'Draft', 'quarter', 'Example',
     'auto-seed-example', 'Example campaign showing a typical launch structure -- delete once you''ve had a look.', 'Winnie Pooh', 'pooh@example.invalid', 1),
    (v_campaign2, NEW.id, 'Example Campaign: Webinar Series (safe to delete)',
     v_programme, v_region_sea, v_bucket_events,
     CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 5000, 'Draft', 'quarter', 'Example',
     'auto-seed-example', 'Example campaign showing an events-led motion -- delete once you''ve had a look.', 'Owl', 'owl@example.invalid', 2);

  INSERT INTO tasks (id, org_id, campaign_id, name, type, owner, start_date, due_date, status, cost_bucket_id, planned_cost, committed_cost, actual_cost, tracking_ref, sort_order) VALUES
    (gen_random_uuid(), NEW.id, v_campaign1, 'Example activity: design creative', 'Content', 'Piglet', CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days', 'Planned', v_bucket_content, 3000, 0, 0, 'auto-seed-example', 1),
    (gen_random_uuid(), NEW.id, v_campaign1, 'Example activity: run paid media flight', 'Paid Media', 'Tigger', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE + INTERVAL '45 days', 'Planned', v_bucket_paidmedia, 15000, 0, 0, 'auto-seed-example', 2),
    (gen_random_uuid(), NEW.id, v_campaign2, 'Example activity: book speakers', 'Events', 'Owl', CURRENT_DATE, CURRENT_DATE + INTERVAL '10 days', 'Planned', v_bucket_events, 2000, 0, 0, 'auto-seed-example', 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_new_organization ON organizations;
CREATE TRIGGER trg_seed_new_organization
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION seed_new_organization();

-- Note: this only seeds North's own tables. It cannot reach into Hub-Backend's
-- separate per-org database (Bodgit&Scarpa's is on Neon, a genuinely
-- different system this trigger has no access to) -- see the companion
-- Hub-Backend change (db.py's create_org()/register_org()) for that half.
