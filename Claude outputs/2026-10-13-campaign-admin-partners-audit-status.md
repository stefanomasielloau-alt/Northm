# 2026-10-13: Admin > Campaigns, campaign targets, Partners by FY, activity-log "Who"

Built locally in Northm. **Not committed, not pushed.** Nothing has been run against the database.

## Run order
1. Supabase SQL editor: run `2026-10-13-migration-campaign-ledby-segments-targets-partner-fy.sql` (additive, safe to re-run). Run the 3 check queries at the bottom.
2. Push Northm (7 HTML files + `skills/explain-campaign-pipeline-gap.json`).
3. Hard refresh. The pages also work if pushed BEFORE step 1: they show a "Database update needed" banner and the new fields are read-only.

Rollback: `2026-10-13-migration-campaign-ledby-segments-targets-partner-fy-ROLLBACK.sql`, plus the archived files `archive/2026-10-13-pre-campaign-admin-partners-audit-*.html` and `archive/2026-10-13-pre-campaign-targets-explain-campaign-pipeline-gap.json`.

## What changed
| # | Ask | Change |
|---|---|---|
| 1 | Activity column -> who leads | Strategy > Admin & configuration > Campaigns: "Activity" replaced by **Led by** (Marketing-sourced, BDR-sourced, Partner-led, Sales-sourced (self-gen), plus "+ Add new"). New `campaigns.led_by`, list in `org_settings.led_by_presets`. The activity (sets cost per lead) moved to Campaign & cost > Business case ("Activity used for cost per lead"). Led by is also editable in Campaign Planning's campaign details. |
| 2 | Segment multi-select | Segments cell opens a tick list with a % per segment and a Total pill (amber if not 100%). New table `campaign_segment_allocations` (backfilled: each campaign's current segment at 100%). Conversion rate uses the weighted mix; the largest share stays in `campaigns.segment_id`. |
| 3 | Budget narrative -> numbers | "line items allocate ... left" removed. Two columns: **Uncommitted** (Budgeted - Committed) and **Unspent** (Budgeted - Actual), negatives in red (brackets). Committed/Actual coming from line items or activities show read-only with an LI / ACT tag (what is shown = what is used). |
| 4 | Currency / alignment | Currency picker on the same line as Budgeted; one money format with thousands separators; figures right-aligned on one edge; FX tag replaces the extra "≈" line. All rows now the same height (checked in a render: 37px each). |
| 5 | Targets for campaign details / Ask Alec | New `target_leads`, `target_pipeline`, `actual_leads` on campaigns. **Strategy > Campaign & cost > Business case** and **Campaign Planning > campaign details** show Target / Expected / Actual / % for Leads, Pipeline, Closed-won. Expected leads = budget / cost per lead; expected closed-won (Strategy only) = projected wins x blended deal; actual pipeline/won = Scoring deals linked to the campaign (pipeline excludes Closed Lost). Ask Alec: the campaign skill now receives these figures (instructions updated); Strategy's panel gets them on Campaign & cost and Admin > Campaigns. |
| 6 | Partner Type list | Campaign Planning and Configuration Partners: presets + types already used, de-duplicated. |
| 7 | $ target by FY | New `partners.acv_targets_by_fy` (e.g. {"FY27": 500000}); existing figure backfilled into the current FY. Table shows "$ target FY27"; Details lists each year with "+ Add year". `acv_target` mirrors the current FY so Reporting is unchanged. |
| 8 | Activity log "Who" | Who column in Campaign Planning, Configuration, Events, Assets, Scoring, Targets (Strategy already had it). Name stamped on new entries; older rows fall back to the user's profile name. **Bug fixed:** every save re-stamped all loaded log rows with the current user's id (all 7 modules). Rows already overwritten before this fix cannot be recovered. |

## Tested
- All inline scripts parse in all 7 files.
- 30 function-level checks (Strategy) + 9 (Campaign Planning / audit) against fictional data: brackets, segment split and primary segment, cannot remove last segment, LI/ACT tags, before-migration banner sends no new columns, targets maths, FY keys (July FY start -> FY27), audit author kept on save.
- Render of the Campaigns table: `2026-10-13-preview-admin-campaigns-table.html` (fictional data).
- NOT tested: live database writes, real login, a real browser click-through.

## Live checks after push (10 min)
1. Admin > Campaigns: set Led by on one campaign, add a new option, reload - both stick.
2. Segments: tick a 2nd segment, set 60/40, reload - split sticks; untick one - row gone.
3. A campaign over budget shows (brackets) in red under Uncommitted.
4. Campaign & cost > Business case: enter Target leads 500 and Actual 210 - shows 42%; open Campaign Planning for the same campaign - same numbers.
5. Ask Alec on that campaign (Campaign Planning) - it should quote target vs actual.
6. Partners: FY27 target in table, "+ Add year" FY28 under Details, reload.
7. Any Activity log: your name in Who on a new edit.

## Known limits
- Reporting still groups by the main segment only (not the % split).
- No expected pipeline figure: there is no pipeline-stage benchmark in Strategy to base it on.
- Actual leads are typed by hand until a lead feed is linked to campaigns.
- Led by list can be added to but not renamed/removed in the app yet.
- Same as all shared fields today: if Strategy and Campaign Planning are open in two tabs, the tab saved last can overwrite the other's edit to the same campaign.
