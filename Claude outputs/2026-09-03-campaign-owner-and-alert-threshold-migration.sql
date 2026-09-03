-- 2026-09-03: "Ready to execute" + "off target" automation triggers, with a "notify the
-- manager" auto-target -- adds the columns Cursus.html and Schema.html now read/write on
-- `campaigns`. Campaigns only for this first pass (scope decision 2026-09-03); activities/
-- events can get the same shape later if useful. Safe to run multiple times (IF NOT EXISTS
-- guards).

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS owner_email TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS alert_threshold_pct NUMERIC;

-- owner_id: links a campaign to a real person (profiles.id) -- set from Cursus.html's
--   campaign detail card. Drives Process Maps' new "notify the manager" automation target:
--   the owner's business unit(s) are looked up (business_units.member_ids), and each such
--   unit's manager is who gets notified. NULL is a valid, common state (no owner set yet,
--   or the owner isn't in North as a user) -- automations just resolve to nobody in that
--   case, same as an unconfigured people/region/team target.
-- owner_name / owner_email: free-text fallback for an external or not-yet-onboarded owner
--   (e.g. a partner or contractor) -- display-only, does NOT feed "notify the manager"
--   (there's no business unit to resolve a manager from without a real owner_id).
-- alert_threshold_pct: per-campaign override of the org-wide "off target" ratio (default
--   100% of budget committed, same as Ordo/Cursus's existing RAG "At risk" check). NULL
--   means "use the default" -- 0 is a real, different value (alert immediately), so this is
--   deliberately nullable rather than defaulting to 0.
