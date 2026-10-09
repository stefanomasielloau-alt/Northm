# Budget line items pop-up wider — 2026-10-10

Committed locally; **not pushed**. Layout only (2 lines); no database or logic change.

## What changed
`CampaignPlanning.html`: the Campaign dialog and the Activity (task) dialog — the two that contain the Budget line items table — were 620 px wide. They are now up to 1180 px wide (still shrink to fit smaller screens). The line-item table has 11 columns, so this gives it room to show without the sideways scroll bar. Other dialogs are unchanged.

## Rollback
`git checkout pre-budget-popup-width-2026-10-09 -- CampaignPlanning.html`, or copy back `archive/2026-10-09-pre-budget-popup-width-CampaignPlanning.html`.

## Tested
Diff review (exactly 2 lines) and inline-script syntax check. **Not viewed in a browser** — after pushing, open a campaign and an activity with several line items; if a scroll bar still shows on a narrow window, tell me the window width and I'll trim columns.
