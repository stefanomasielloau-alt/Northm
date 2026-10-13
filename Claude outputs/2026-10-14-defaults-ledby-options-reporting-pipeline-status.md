# 2026-10-14: campaign defaults, Led by options, Reporting segment split, expected pipeline

Built in Northm, **not committed / not pushed**. Archives: `archive/2026-10-14-pre-defaults-ledby-mgr-pipeline-*.html`, `archive/2026-10-14-pre-expected-pipeline-explain-campaign-pipeline-gap.json`.

## Run order
1. Push Northm (`Strategy.html`, `CampaignPlanning.html`, `Reporting.html`, `skills/explain-campaign-pipeline-gap.json`).
2. Optional: `2026-10-14-migration-pipeline-gate.sql` (one column). Only needed to CHOOSE the pipeline stage; without it the app auto-picks the first stage named like SQO / opportunity / pipeline (Tac-Tik: **SQO**). Rollback alongside.

## What changed
| # | Item | Change |
|---|---|---|
| 3 | Defaults for campaigns started in Campaign Planning | When Strategy loads, blanks only: no segment -> the org's **Unassigned** segment; blank Led by -> suggested from the activity/route (same rule as last night's pre-fill). One audit-log line each. Never overwrites a value; skipped in the all-organisations and read-only views. **On first load after the push, Tac-Tik's "RLS TEST CAMPAIGN" and "Denn campaign" move from "— choose — ⚠" to Unassigned.** |
| 4 | Led by options | Admin > Campaigns > **Led by options** button: rename (updates every campaign using it), remove (only when no campaign uses it; shows the count), add new. |
| 5 | Reporting | Correction: Reporting never grouped budgets by segment; its only segment use is the Relationship map. That now links a split campaign to every segment it is split across (not just its main one). |
| 6 | Expected pipeline | New **Pipeline stage** chooser at the top of Admin > Funnel gates (Automatic = SQO for Tac-Tik). Expected pipeline = expected count at that stage x blended deal size (Strategy Business case), or expected leads x funnel rates to that stage x average deal size (Campaign Planning details). Shown in the Pipeline row's Expected and "Expected vs target", and sent to Ask Alec (skill instructions updated). |

## Tested
All inline scripts parse; new checks: expected pipeline (auto + chosen stage, both modules), defaults fill blanks only, rename/remove/add Led by options; all earlier suites re-run and pass. SQL syntax checked. Not yet clicked live (needs the push).

## Live checks after push
1. Admin > Campaigns: the two no-segment campaigns now show Unassigned; Activity log shows a "default" entry.
2. Led by options: rename one, check campaigns follow; Remove is greyed for options in use.
3. Campaign & cost > Business case: Pipeline row has an Expected figure; Admin > Funnel gates shows Pipeline stage = Automatic (SQO).
4. Reporting > Relationship map: a split campaign shows under each of its segments.

## Addendum (09:30): live check + expected-pipeline fix (needs one more push of Strategy.html)
- Live after push: Pipeline stage chooser shows "Automatic (SQO)"; Led by options panel works; all campaigns have a segment and Led by (Stef had already set RLS TEST CAMPAIGN -> Mid-Market and Denn campaign -> SMB at 22:18, so the defaults had nothing to fill).
- **Fixed:** Strategy's expected pipeline worked BACKWARD from the campaign's conversion override (e.g. FY27 Enterprise Field Series uses a 2.1% "historical" rate vs the funnel's own 0.057% end-to-end), which implied 129 SQOs from 439 expected leads and showed $16.5M. It now works FORWARD from expected leads through the funnel's stage rates, same as Campaign Planning: about 3.5 SQOs, roughly $450k (Campaign Planning live: $449,553; small differences come from Strategy's segment multipliers and blended deal size). Archive: `archive/2026-10-14-pre-forward-pipeline-Strategy-v2.html`.
- Worth a look (data, not code): that campaign's 2.1% conversion override is ~37x the funnel's own rate, and the funnel lists Win (15%) BEFORE SAO (50%), so Business case "Projected SAO" and expected closed-won ($1.18M) come out higher than expected pipeline. Either the override or the gate order is likely off.
