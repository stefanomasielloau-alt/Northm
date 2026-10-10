# Budget line items - one rule so the numbers add up  (2026-10-10)

Committed locally in Northm; **not pushed**. No database change. With zero line items every figure is exactly what it was.

## Why they did not add up (the finding)
Line items were built (9 Oct) as an *additive* panel. The activity dialog kept its own typed Planned / Committed / Actual boxes and the line-items panel did not feed them; Campaign Planning's campaign totals, Planning and Effectiveness pages all added up the typed activity boxes; only Strategy read the lines. So the same money could be entered in four places (campaign Budget, campaign lines, activity boxes, activity lines) and nothing reconciled them. (My 9 Oct note saying "Campaign Planning's own totals already come from the line-item panel" was wrong - correcting it here.)

## The rule you chose (keep both levels, one rule; Budget stays an envelope)
- **Activity:** for each of Planned / Committed / Actual, if the activity has at least one line with a value for that stage, the figure = the **sum of those lines** and the box turns grey, read-only, labelled "from line items". No lines for that stage = the typed box, editable, as today. (Planned = sum of Planned amounts; typed values are never overwritten in the database, so deleting the lines brings them back.)
- **Campaign:** Committed / Actual = its activities' figures (by the rule above) **plus the campaign's own lines** (costs for the whole campaign, not one activity).
- **Budget:** the campaign's typed **Budget stays the envelope**. A new **"Allocated by line items"** tile in the campaign dialog shows what the lines add up to (per line Approved, else Planned; campaign + activities) and how much is left or over. Strategy keeps using the typed Budget; only if that is empty/zero does Strategy fall back to the allocated total (my addition so lines-only campaigns still show a budget - say if you would rather it stayed 0).

## Where it applies
- **Campaign Planning:** activity dialog, Activities table cells, campaign dialog tiles, campaign and programme totals, Planning KPI strip, Planning/Effectiveness numbers, activity status colour (RAG), CSV export and webhook payload, and the roll-up snapshot sent to Strategy. Adding / editing / deleting a line repaints the boxes and tiles in place (no re-render, so Tab keeps working).
- **Strategy:** Committed / Actual use the same rule (live from the database); Budget keeps the envelope, with a "line items allocate $X ($Y left)" note under the Budget box.
- **Not covered: Reporting.html.** It reads the campaign's own typed fields only, so after line items are entered its campaign figures can differ from Campaign Planning and Strategy. Same fix pattern; say the word.
- Currency: line items have no currency of their own, so they are treated as the main currency (unchanged from before).

## Behaviour changes to know about
1. **Strategy's 9 Oct rule changed**: it used to replace Budget with the line total whenever lines existed; now the typed Budget is the envelope (as you chose).
2. Strategy Committed/Actual used to take the line total and ignore activities without lines; now activities without lines keep their typed numbers (so nothing silently drops out).

## Files
`shared/lineItemRollup.js` (rule, rewritten, same function names plus new ones), `shared/budgetLines.js` (new optional `onRows` callback), `CampaignPlanning.html`, `Strategy.html` (one extra column set on the tasks query + the hint). New Help entry in Campaign Planning: "Why can't I type Planned, Committed or Actual on an activity?".

## Rollback
`git checkout pre-lineitem-rule-2026-10-10 -- CampaignPlanning.html Strategy.html shared/budgetLines.js shared/lineItemRollup.js`, or copy back the `archive/2026-10-10-pre-lineitem-rule-*` files (the old rule file included).

## Tested
- Rule module: 25 checks (stage-by-stage fallback, explicit zero is a real value, campaign = activities + campaign lines, allocated, orphan lines, null input).
- Campaign Planning's real helper code (extracted from the patched page) against a fake database: 24 checks (typed behaviour unchanged with no lines, read-only boxes, totals, Allocated tile under/over/no-envelope, in-place repaint on add/delete, guard before first load, query error, 2,500-line paging).
- Strategy loader + helpers: 12 checks incl. envelope kept, empty-Budget fallback, error paths.
- Line-items panel regression (38 existing checks) + 3 new `onRows` checks.
- **Not tested:** the live pages with real data. After pushing: in Campaign Planning open an activity, add a line (Planned 1,000, Committed 600) and watch the Planned/Committed boxes turn grey with the numbers; check the campaign tiles; then open Strategy > Campaign & cost.
