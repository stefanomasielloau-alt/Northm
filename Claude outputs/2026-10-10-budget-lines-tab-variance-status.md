# Budget line items: Tab, auto Variance, reopen — 2026-10-10

Committed locally; **not pushed**. Code only (`shared/budgetLines.js`); no database change.

## What was wrong
- **Tab:** every time you left a box, the whole table was redrawn (and again when the roll-up reloaded), which threw away the cursor. Typing after Tab went nowhere.
- **Variance:** it was a plain box you had to type in.

## What changed
- Saving a box now updates only that row's status, its Variance cell and the totals. The table is no longer redrawn, so Tab moves normally, even with a slow connection. "+ Add line" puts the cursor in the new line's Description.
- **Variance is now automatic and read-only** (shown as plain text, skipped by Tab):
  Variance = outcome − budget, where budget = Approved, else Planned (same rule as the Strategy roll-up) and outcome = Actual if entered, else Committed if entered. Positive = over budget (red), negative = under (green), blank until there is both a budget and an outcome. Hover on the column heading explains it.
  The calculated value is also written to `variance_amount` on each save, so the roll-up view's variance total keeps working. Old lines with a hand-typed variance show the calculated figure straight away; the stored number is corrected the next time that line is edited (the "Including tasks" variance total comes from that stored value, so it can differ until then).
  **If you want a different rule** (e.g. Actual − Approved only, or Committed − Planned) it is one small function, `calcVariance`.
- When a campaign has no lines of its own but its activities do, the panel now shows the "Including tasks" totals with an explanation instead of just "No line items yet".

## "Lines not there when I go back in" — honest status
I could **not reproduce** this. On your live site (read-only) I opened the campaign with 2 lines and closed/reopened it repeatedly (100 ms, 600 ms, 1.8 s, and with extra page refreshes mid-load): the 2 lines showed every time. I didn't add lines (that would write to your data). Two real causes I did fix: values typed after Tab were being lost by the redraw, and a campaign whose lines sit only on activities looked empty. If it still happens after the push, tell me: campaign or activity dialog, what you added, how you left and re-entered.

## Rollback
`git checkout pre-budget-lines-tab-variance-2026-10-10 -- shared/budgetLines.js`, or copy back `archive/2026-10-10-pre-budget-lines-tab-variance-budgetLines.js`.

## Tested (headless browser, fake database with 250 ms delay)
38 checks pass: Tab moves focus and typed values survive in-flight saves, variance recalculates (Actual else Committed vs Approved else Planned), is stored, has no input, shows blank/over/under, totals, failure revert, read-only mode, tasks-only roll-up, plus all the earlier panel checks. Test file: `2026-10-10-budgetLines-v2-test.js`. Not yet seen on the live page (needs the push).
