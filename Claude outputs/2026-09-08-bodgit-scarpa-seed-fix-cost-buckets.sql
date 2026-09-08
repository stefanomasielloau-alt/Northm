-- 2026-09-08: follow-up to 2026-09-08-bodgit-scarpa-full-seed.sql.
--
-- Live check after that seed ran: regions (3), pods (1), programmes (2),
-- campaigns (6), and tasks (8) all landed exactly as expected -- but
-- cost_buckets came back at 0, even though campaigns/tasks reference
-- those exact cost_bucket_id values. Not sure why that one INSERT alone
-- didn't take (possibly just not selected/run along with the rest) --
-- rather than guess, this just re-adds the 5 missing rows on their own.
--
-- Safe to run even if some of these already exist: ON CONFLICT (id) DO
-- NOTHING means a row that's already there is left alone, not duplicated
-- or errored on.

INSERT INTO cost_buckets (id, org_id, code, label) VALUES
  ('a2000000-0000-4000-8000-000000000001', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'CONTENT',   'Content & creative'),
  ('a2000000-0000-4000-8000-000000000002', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'PAIDMEDIA', 'Paid media & advertising'),
  ('a2000000-0000-4000-8000-000000000003', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'EVENTS',    'Events & sponsorship'),
  ('a2000000-0000-4000-8000-000000000004', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'EMAIL',     'Email & marketing automation'),
  ('a2000000-0000-4000-8000-000000000005', '8eae1af2-8af8-4224-94c1-5ddf2ff237f2', 'AGENCY',    'Agency & contractor fees')
ON CONFLICT (id) DO NOTHING;

-- Verify:
SELECT count(*) AS cost_buckets FROM cost_buckets WHERE org_id = '8eae1af2-8af8-4224-94c1-5ddf2ff237f2';
