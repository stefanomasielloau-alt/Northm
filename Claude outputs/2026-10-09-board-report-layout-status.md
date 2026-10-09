# Board report layout (Edit layout) — built 2026-10-09

Built and committed locally; **not pushed**. Nothing changes on live until you push Northm. No database change.

## What you get
- Strategy → Board report now has the same **Edit layout / Reset layout** buttons as the other Strategy pages.
- The page is split into 10 boxes you can move, resize, hide, or swap: KPIs, Plan vs actual by year, Funnel snapshot, Budget summary, Campaign highlights, Targets, Scoring, Commentary, Gap to target by region, What changed this period.
- Defaults reproduce today's page (Targets and Scoring side by side, everything else full width).
- **Print / Save as PDF matches the on-screen layout**: section order and widths follow your arrangement, hidden boxes are not printed, edit handles never print.
- Layout is saved per browser, like the other Strategy pages (Reset layout restores the default).
- Saved-history views and the "no access" panel are not editable, so the Edit buttons are hidden there.
- The PowerPoint export is unchanged (built from the data, not the screen layout).

## Rollback
- Restore code: `git checkout pre-board-layout-2026-10-09 -- Strategy.html shared/grid.js` (tag = commit c090183), or copy back `archive/2026-10-09-pre-board-layout-Strategy.html` and `archive/2026-10-09-pre-board-layout-grid.js`.
- Or undo the commit with `git revert <this commit>`.
- A saved layout in someone's browser is harmless after rollback (it is keyed to the board report only).

## Tested
- Golden compare: for 6 scenarios (normal, empty data, AI commentary, AI error, no access, saved snapshot) the new page's content is identical to the original once the grid wrappers are removed.
- Real GridStack + the real Strategy grid CSS: 10 boxes positioned, no overlaps, nothing clipped, Edit layout shows Hide per box, hiding removes the box, moving a box changes print order, hidden box not printed, print copy shows only in print media and is removed afterwards.
- Syntax check of Strategy.html and grid.js.
- **Not tested:** the live page with real data, the real browser print dialog / PDF output, and touch dragging. Please click through after pushing: Edit layout → move a box → Print preview.

Test script: `2026-10-09-boardReportLayout-test.js` (+ grid css file) — needs Playwright and the staged files, kept for the record.
