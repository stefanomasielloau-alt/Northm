# Budget line items → Strategy roll-up — built 2026-10-09

Built and committed locally; **not pushed**. No database change. With zero line items (today's state) every Strategy number is exactly what it was.

## The rule (one place: `shared/lineItemRollup.js`)
A campaign's lines = lines on the campaign itself + lines on its tasks.
- **Budget** = per line, Approved amount, else Planned amount; summed.
- **Committed** = Committed amounts; summed.
- **Actual** = Actual amounts; summed.

Each figure switches to the line-item total **only when at least one line has a value for that stage**. Otherwise Strategy keeps using today's fields (campaign Budget with currency conversion, the Campaign Planning roll-up for Committed/Actual, then the plain Committed/Actual boxes). Example: a campaign whose lines only have Committed filled in gets Committed from lines; Budget and Actual stay as today.

## What changed in Strategy.html
- The three existing helper functions (`campaignBudgetMain`, `campaignCommitted`, `campaignActualSpend`) ask the new rule first. Everything built on them follows automatically: Board report, dashboards, Actuals, budget by bucket, campaign highlights.
- Admin → Campaigns programme totals use the same rule for Committed/Actual.
- Campaign & cost table: where lines drive a figure, a small blue "from line items: $X" note appears above that box. The box stays editable and is used only when there are no lines for that figure. Nothing is overwritten or saved differently.
- Loading is additive and fail-soft: if the tables are missing or unreadable, nothing changes. It reads lines and task ids in pages of 1000 so a large organisation is never silently cut off.

## Not covered (decide if you want it)
- **Reporting.html** has its own copy of the campaign budget calculation (`campaignBudgetMain` there, plus the campaign Budget card) and does not read line items yet, so once someone enters lines, Reporting's campaign budget can differ from Strategy's. Same fix pattern; say the word.
- Campaign Planning's own totals already come from the line-item panel.
- Currency: line items have no currency of their own, so they are treated as the main currency.

## Rollback
- Code: `git checkout pre-lineitem-rollup-2026-10-09 -- Strategy.html`, or copy back `archive/2026-10-09-pre-lineitem-rollup-Strategy.html`. `shared/lineItemRollup.js` can then stay unused.
- Or just remove the `<script src="shared/lineItemRollup.js">` tag: the helpers fall back to today's behaviour.

## Tested
- 14 checks on the rule (approved-else-planned, task lines via their campaign, partial stages, orphan tasks, real zeros, no lines = today's figures).
- 8 checks running the actual patched Strategy helper and loader code against a fake database: attach, unchanged campaigns, hint shown only where relevant, lines error, zero lines, tasks error, 2,500 lines paged.
- Syntax check of Strategy.html.
- **Not tested:** the live page with real data. After pushing: in Campaign Planning add a line (Approved 1,000, Committed 600) to a sample campaign, then in Strategy → Campaign & cost check the blue notes, and the Board report budget numbers; delete the line to see it revert.
