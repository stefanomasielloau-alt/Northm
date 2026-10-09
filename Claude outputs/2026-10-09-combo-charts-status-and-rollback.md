# Combo charts (option A) — status, audit and rollback (2026-10-09)

Nothing is pushed or live yet. Local commit only; you push. Live data untouched (charts only).

## Audit result (read-only)
- **Where charts are:** Strategy.html has ~34 chart calls, Reporting.html 3, all through `shared/charts.js` (6 hand-written functions). No other chart library or canvas anywhere.
- **Data shape:** every call builds its data inline as plain "categories × series" lists, so no widget needed re-plumbing to feed a combo chart — the second series was already being computed in the same function.
- **Board report PowerPoint:** the Hub export builds slides from numbers and text only (no chart images, no `add_chart`), so combo charts do **not** affect it. The Board report page itself prints from the screen; the new "Show as" buttons are hidden when printing.

## What was built
1. **`shared/chartsCombo.js` (new file, additive).** `svgCombo` (bars + lines + areas, optional right-hand axis, hover tooltips on every bar/point), `comboLegend`, and `chartPick` (the same chart with a "Show as: Combo | Bars | Stacked | Lines" switch; choice remembered in memory for the page and in the browser when allowed).
2. **Three Strategy charts upgraded** (only 10 lines changed in Strategy.html):
   - Campaign calendar → one chart: spend per month (bars) + campaigns live (line, right axis). Replaces the two stacked charts.
   - Actuals multi-year trend → Actual (bars) + Plan (dashed line).
   - Board report "Budget summary, by cost bucket" → Budget (bars) + Spend, actual or committed where no actual (line).
3. **Test:** `Claude outputs/2026-10-09-chartsCombo-test.js` — 29 headless checks, all pass, including: the six existing chart functions give byte-identical output after the new file loads; axes scale independently; escaping; empty/null data; stacking; the switch; works with storage blocked.

## Rollback (three independent levels — none needs a deletion)
- **Level 1 — instant, no code change:** every upgraded chart checks `typeof chartPick==='function'`. If `shared/chartsCombo.js` is missing, renamed or fails to load, the page automatically shows the original charts. To switch off on a live page for testing, run `window.NORTH_NO_COMBO=true` in the browser console and reload the widget.
- **Level 2 — restore the file:** `git checkout pre-combo-charts-2026-10-09 -- Strategy.html` (tag on the commit before this work), or copy `archive/2026-10-09-pre-combo-charts-Strategy.html` back over `Strategy.html`.
- **Level 3 — undo the commit:** `git revert <this commit>` (hash in the reply). `shared/charts.js` and `Reporting.html` were not changed, so nothing else can be affected.

## Not yet verified (needs your push + a look)
- Real-page appearance on Strategy (the test used the real `charts.js` with stand-in page helpers, and the three changed expressions were exercised in "on", "off" and "library missing" modes, but Strategy itself needs live data).
- After you push: open Strategy → Campaign calendar, Actuals → Multi-year trend, and Board report → Budget summary by cost bucket; click the four "Show as" buttons on each.

## Decisions for you (not built, to avoid unnecessary rework)
1. Add the same chart to more places (e.g. Gate comparison top-down vs bottom-up, Spend by cost bucket, the three Reporting bar charts)? Each is a ~3-line change.
2. Remember the "Show as" choice per user in the database (shared across devices) instead of per browser? Needs a small table; not done.
3. A "build your own chart" picker (choose the numbers and shapes) is the next phase — only worth it if you want it after seeing these three.
