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
