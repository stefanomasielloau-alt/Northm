# Day status + backlog changes — 2026-10-09 (you were out; I worked unattended)

Read-only on live systems; nothing destructive; no live data written; commits local only (you push). Detail docs: `2026-10-09-1409-testing-findings.md`, `2026-10-09-north-hub-website-page-copy-draft.md`, `2026-10-09-budget-line-items-component-status.md`.

## Backlog items CLEARED today (evidence)
| Backlog item | Result |
|---|---|
| #13 v7 RLS bypass closure + ~7 "did it run?" migrations | **All 29 groups APPLIED** per your READONLY migration query run in Supabase (v7 closed, stream/segment dedup clean, region_streams, campaign_execution_status, profile_orgs, confidence_level, budget_line_*, partners-build) |
| #3 connectors + voice platform setup | Tables **exist** (`connector_*`, `voice_*` APPLIED); connectors page + Voice card live; dedicated key active (Portability warning gone). *Not yet confirmed:* `voice` function deployed/JWT setting (UI loads, no real provider tested) |
| #14 Item 47 drill-down | Works live: "Everything" drew a 49-node graph. (Slicing by region/pod not exercised.) |
| Pending-migrations list | Closed — nothing outstanding |
| Live UAT (all modules) | 0 thrown errors across ~60 pages; see findings doc |
| Step 2b entry UI | **Built for Campaign Planning** (campaign + activity dialogs); verified read-only against the real tables; local commit |

## NEW backlog items found
1. **Flows' "App / connector (via Hub)" steps have nowhere to connect** since the CRM section left Hub (flows.py still uses Hub's own connector tokens/env vars; messages still say "Hub Settings > Connectors"). `connectors.py` is **not** unused — do not retire it. Needs your decision: have flows read North's connector tokens (build) or something else. Likely low impact until someone uses a connector step.
2. ProcessMaps FAQ "How do I connect outside apps" is stale (says credentials are added in Hub).
3. 8 HELP/FAQ additions proposed (not applied) — see findings doc.
4. Reporting drill-down start list shows duplicate programme names under "All organisations" — check in a single-org view.
5. Process Maps first load >5 s (spinner) — minor.

## Step 2b — what exists now
- Campaign Planning: open any campaign → "Budget line items" panel (category, description, Planned/Quoted/Approved/Committed/Actual, variance + reason, add/delete, totals, "Including tasks" roll-up row). Open any activity → same panel at task level.
- Additive: does not change the existing Budget / Planned / Committed / Actual fields or any dashboard number. Making those fields derived from line items is a separate decision (per your 7 Oct answer #5) — not done.
- View-only users see it read-only. Unsaved (not-yet-in-database) records show "save it first".
- Strategy.html's campaign-level entry NOT done (Campaign Planning already covers campaign + activity levels); say if you want it duplicated in Strategy.
- Risk: tested headlessly (fake DB, 28 checks) and read-only against the live tables; the add/edit/delete **writes were never run against production** — do one add/edit/delete on a sample campaign after you push.

## Still needs YOU (unchanged from earlier message, trimmed)
Item 37 answers · pricing shape + demo/support contacts + domain · Platform Settings go/no-go · flow-inbound token retest · password-reset template paste · Reset layout click (Strategy → Drivers & rates) · voice provider sign-up/test · push Northm + Hub-Backend `1e38680` · decision on item 1 above · FAQ proposals OK/not OK.

## Files created / modified today
Created (Northm): `Claude outputs/2026-10-09-1409-testing-findings.md`, `…-north-hub-website-page-copy-draft.md`, `…-day-status-backlog-delta.md`, `…-budget-line-items-component-status.md`, `…-budgetLines-test.js`; `shared/budgetLines.js`; archives `archive/2026-10-09-pre-sync-budgetLines.js`, `…-pre-sync-budgetLines-test.js`, `…-pre-budget-lines-CampaignPlanning.html`.
Modified (Northm): `CampaignPlanning.html` (script tag, panel host in 2 dialogs, 1 line in render()).
Project copies under `claude/`: findings, website copy, status docs.

## Added later 9 Oct — "do line-item numbers still roll up to Strategy?"
- **Existing roll-up is unchanged.** Strategy still gets committed/actual from the `campaign_rollups` table (20 rows) and budget from `campaigns.budget`. Nothing I built touches those calculations, and there are **0 budget line items** in the database today, so every Strategy number is exactly what it was.
- **Line items do NOT roll into Strategy yet.** Checked Strategy.html: it never reads `budget_line_items` or the roll-up views. The views exist and are built correctly (read live: campaign total = its own lines + its activities' lines; programme total = sum of its campaigns), but they are display-only for now.
- **Decision needed to connect them:** when a campaign has line items, should Strategy's Budget = sum of Approved (falling back to Planned), Committed = sum of Committed, Actual = sum of Actual — and with no line items, keep today's plain fields? That is my suggested default; it was your 7 Oct answer #5 in spirit but the exact stage mapping was never specified.
- Once you confirm, I'd (1) make the mapping a single function, (2) test with a sample campaign in a rolled-back session or a test org, (3) wire Strategy's campaign cost + programme totals, (4) re-check Board report / dashboards read the same numbers.
