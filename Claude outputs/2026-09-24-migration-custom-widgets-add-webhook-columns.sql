-- 2026-09-24 -- Additive follow-up to 2026-09-24-migration-custom-widgets-table.sql (that one
-- you already ran successfully tonight). Adds the 2 columns needed for the new 'api'/'webhook'
-- external-widget types (Stef: "Need provision for API based widgets, webhook etc").
--
-- Purely additive (ADD COLUMN, nothing dropped or altered) -- safe to run any time after the
-- base table exists. NOT YET RUN. Prepared for Stef's review, per standing process.
--
--   webhook_token: a random secret generated client-side when a widget's type is set to
--     'webhook' (Ordo.html's addCustomWidget()). Part of the URL the external system POSTs to --
--     see functions/widget-webhook/index.ts (separate file, delivered alongside this migration)
--     for how it's checked. Never set for iframe/gdoc/api widgets.
--   latest_payload: the last JSON body a webhook POST delivered for that widget. Written ONLY by
--     the widget-webhook Edge Function (using the service-role key, bypassing RLS) -- North's own
--     save flow deliberately never writes this column, so a normal save can't clobber
--     webhook-pushed data. Also read (but never written) by an 'api'-type widget's fallback
--     display if you want one later; today 'api' widgets fetch live instead and ignore this
--     column entirely.
--
-- No RLS policy change needed -- the existing custom_widgets_org_isolation policy already covers
-- SELECT/UPDATE of these new columns the same as every other column on the table (for regular
-- signed-in users; the Edge Function writes as service-role, which bypasses RLS by design).

BEGIN;

ALTER TABLE custom_widgets ADD COLUMN IF NOT EXISTS webhook_token text;
ALTER TABLE custom_widgets ADD COLUMN IF NOT EXISTS latest_payload jsonb;

COMMIT;

-- Not executed by this session -- prepared for Stef to review and run himself, per standing
-- process. Run this before deploying functions/widget-webhook (the function's first UPDATE would
-- otherwise fail with "column latest_payload does not exist").
