-- Item 50 part 2 -- Board report Google Sheets export, 2026-09-09
--
-- One nullable, additive column: which existing Google Sheet an org's Board Report
-- "Export to Sheets" button writes into. Set automatically the first time someone in
-- that org exports (they paste a Sheet URL/ID once, North remembers it here) -- there
-- is no migration-time value to seed.
--
-- Note: Hub-Backend's /sheets/request endpoint only supports get/update/clear against
-- an EXISTING spreadsheet, not creating a new one -- so the org must already have a
-- Google Sheet to point at (any blank sheet works; North writes starting at cell A1
-- and overwrites whatever was there on each export).
--
-- The export also requires the exporting North user's email to match an existing Hub
-- account that has Google connected under Hub Settings -- same precondition as every
-- other North-to-Hub cross-org call (push-to-Hub, etc). If that's not set up yet, the
-- export button will fail with a clear message rather than doing nothing silently.
--
-- Safe to run multiple times.

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS board_report_sheet_id text;

-- Verification
SELECT org_id, board_report_sheet_id FROM org_settings WHERE board_report_sheet_id IS NOT NULL;
