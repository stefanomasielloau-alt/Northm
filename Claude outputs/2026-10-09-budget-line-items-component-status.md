# Budget line items — entry component (Reference Environment, subsystem 1, step 2b) — status 2026-10-09

## What was built (additive only)
- `Northm/shared/budgetLines.js` — a self-contained panel. A page mounts it on any element:
  `NorthBudgetLines.mount(el, { sb, orgId, parentType:'campaign'|'task', parentId, canEdit, showRollup, onChange, onAudit })`.
- Shows the lines for one campaign/task: category (from `budget_line_categories`), description, Planned / Quoted / Approved / Committed / Actual, Variance amount + reason, Add / Delete, totals row, and (campaigns) an "Including tasks" row from `campaign_budget_rollup`.
- Saves one row at a time when a box is left. Amounts accept `$`, commas, `(50)` or `-50`; blank = empty (not 0); text is rejected without touching the database. A failed save puts the old value back and says why.
- Zero lines is a valid state (totals read 0). View-only users (`canEdit:false`) get a read-only table. If the migration hasn't been run it shows a plain "not installed yet" message.
- **Not wired into Strategy.html or CampaignPlanning.html.** Those pages are large and use staged saves; I didn't edit them unattended. Wiring is about 5 lines per page (add a container, call `mount` with the page's `sb`, `_clickOrgId()` and its existing edit-permission flag) — do together.

## Tests
`Claude outputs/2026-10-09-budgetLines-test.js` (Playwright, fake in-memory Supabase): 22 checks, all pass — scoping to the right parent, totals, amount parsing, null handling, no-op saves skip the DB, insert/delete payloads, HTML escaping, failed-save revert, read-only, empty and missing-table states.
**Not tested:** against the real Supabase tables/RLS, or inside the real pages.

## Needs from you
1. Confirm `2026-10-07-migration-budget-line-items.sql` is run in North (it is described as live).
2. Say when you want the integration into Strategy / CampaignPlanning (and whether the Configuration "Budget categories" page already manages categories).
3. `git push`: Northm (new shared file + earlier commits) and Hub-Backend `1e38680` (pointer-line removal, local only).

## Files
- Created: `Northm/shared/budgetLines.js` — the component.
- Created: `Northm/Claude outputs/2026-10-09-budgetLines-test.js` — its browser test.
- Created: `Northm/Claude outputs/2026-10-09-budget-line-items-component-status.md` — this note.
