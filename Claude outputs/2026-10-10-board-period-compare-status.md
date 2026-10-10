# Board report: choose the period, compare with earlier years — built 2026-10-10

Committed locally; **not pushed**. No database change. With "Full year" and "Compare: Nothing" (the default) the report is byte-for-byte what it was (tested against the previous version).

## What you get (Strategy → Board report)
A new **Period & comparison** card (not printed) above the report:
- **Period** (inside the financial year picked in the top bar): Full year, H1, H2, Q1–Q4, Year to date, Single month, or Custom months (From–To).
- **Compare with**: Nothing / same period last year / last 2 years / last 3 years.
- Your choice is remembered in this browser. The printed report states the period (and the comparison) near the top.

## How each number is worked out
- **Funnel actuals and revenue**: the recorded monthly actuals for only the months in the period.
- **Plan**: the year's target phased by your **Seasonality** weights (same weights as the Phased plan page), so Q2 plan = Q2's share of the year target. Full year = unchanged.
- **Budget, committed, spent**: these have no month of their own, so for a part-year each campaign counts in proportion to how many of its days fall in the period. Campaigns with no start/end dates are spread evenly over the year being reported (and never counted in earlier years).
- **Comparison**: same fiscal months of the earlier year(s), from recorded actuals. KPI tiles show "vs FY26 · Q2 (Oct–Dec): 1,200 +8%"; the funnel table gets an actual + change column per earlier year; a year with no recorded data says "no recorded data" instead of a fake change. Spend is compared like-for-like by campaign dates.
- "Gap to target by region" uses the period too (regional ACV target × the period's share).
- The PPTX/Sheets payload carries the period in its FY label, so the deck's title says e.g. "FY27 · Q2 (Oct–Dec)"; the deck layout itself does not yet draw the comparison columns (that needs a change in Hub-Backend; the numbers already follow the period).

## Things to know
- "Campaign highlights" still shows sign-off status and over/under-budget campaigns across the whole year (it is about sign-off, not a period).
- Comparison needs history: months before the first recorded month show as "no recorded data".
- Spend per period is an estimate (pro-rating), labelled as such on the card.

## Files
- `Strategy.html`: period controls, period-aware numbers, comparison, labels, payload.
- `shared/boardPeriod.js` (new): the period/plan-share/date/compare maths, no screen code.
- `shared/lineItem…` untouched.

## Rollback
`git checkout pre-board-period-2026-10-10 -- Strategy.html` (and delete `shared/boardPeriod.js` or leave it unused), or copy back `archive/2026-10-10-pre-board-period-Strategy.html`.

## Tested
- 26 checks on the pure maths (`2026-10-10-boardPeriod-test.js`): presets, clamping, seasonality share, leap years, year wrap, overlap pro-rating, deltas.
- 25 checks against the real Board report code with a fake plan (`2026-10-10-boardPeriod-page-test.js`): identical to the old report at defaults, Q2 plan/actual/spend numbers, 3-year compare incl. a year with no data, controls, printed line, payload, settings round-trip.
- Not tested: the live page with real history (needs the push), the PPTX download.
