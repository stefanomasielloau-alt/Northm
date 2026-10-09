# Board report: 3 new charts + access-control plan (2026-10-09)

Charts are built and committed locally (not pushed). The access change is a plan only, awaiting your approval, because it needs a database migration.

## 1. Charts added to the Board report (live view only)
| Chart | Where on the page | Data used |
|---|---|---|
| Plan vs actual by year (Actual bars + dashed Plan line) | New card under the KPI strip | Same data and FY list (FY25–FY27) as Actuals → Multi-year trend; Plan = win target from Drivers & rates |
| Pipeline by stage (value bars + deal-count line, right axis) | Inside the Scoring (deal pipeline) card, above the stage table | Deals loaded from Scoring. Added one field, `valueByStage`, next to the existing counts; existing fields unchanged |
| Gap to target by region, ACV (waterfall) | New card above "What changed this period" | Regional ACV target (Geography & pods) → each region's recorded ACV minus its target → recorded ACV total |

Notes
- The first two have a "Show as" switch (Combo / Bars / Stacked / Lines). The waterfall is a fixed shape.
- Not in the PowerPoint export or in saved board-report history views: both are built from the saved/exported numbers, which I did not change. Adding them to the deck is a separate Hub-Backend change (not requested yet).
- Budget summary chart blank: the table under it already says "No campaign budget recorded for the visible regions yet." when no campaign has a cost bucket plus budget/committed/actual; the chart is skipped in that case.
- Assumptions to check against real data: (a) region ACV targets are filled in; (b) "recorded ACV" is the `_acv` value in Actuals history; (c) the year chart's Plan is one flat annual target, as on the Actuals page.
- Tested: sample-data render of all three shapes (no errors), syntax check, and shared/charts.js plus Reporting.html unchanged. Not tested: the real Board report with live data (needs push).

## Rollback
- Level 1: set `window.NORTH_NO_COMBO=true` hides the year and pipeline charts (the waterfall uses the existing chart function and has no switch).
- Level 2: `git checkout pre-board-charts-2026-10-09 -- Strategy.html` (tag = commit 2db6401, the combo-charts state), or copy `archive/2026-10-09-pre-board-charts-Strategy.html` back. To go back further: tag `pre-combo-charts-2026-10-09`.
- Level 3: `git revert <this commit>`.

## 2. Board report menu link for approved people only (PLAN, not built)
Today: hidden from Strategy's menu on purpose (moved to Reporting on 3 Sept); reachable from Reporting's "Open Board report" button or the direct URL, for anyone who can open Strategy.
Existing access model: org ceiling → role (Configure / Publish / Can edit, stored on the `roles` table) → per-person Modules toggle (Users table).

Options
- A. Reuse "Publish": no database change.
- B. (my recommendation) New role setting "View board report": 
  1. Migration (you run it in Supabase, with a ROLLBACK script): add `view_board_report boolean not null default false` to `roles`; backfill `true` for roles that already have Configure, so admins keep access.
  2. Configuration → Roles: one new tick box.
  3. Strategy: load the flag with the role; show "Board report" in the Strategy menu only when true; the page itself shows a "You don't have access" panel otherwise; Reporting's "Open Board report" button follows the same rule.
- C. Per-person toggle in the Users table.

Limit to be aware of: this hides the menu link and the page. It does not hide the underlying numbers, which people can already see on other Strategy pages under their org permissions. Hiding data itself is a separate database-level job.
