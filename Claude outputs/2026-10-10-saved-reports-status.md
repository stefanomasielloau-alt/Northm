# Saved private & public reports (Reporting) — built 2026-10-10

Committed locally; **not pushed**. **Needs one SQL file run first:** `2026-10-10-migration-saved-reports.sql` (rollback: `…-ROLLBACK.sql`). Until it is run, the new page says "Saved reports need a one-time database setup" and nothing else changes.

## What you get
- **Reporting → Reports** now has a **Saved reports (private & shared)** button (also a "Saved reports" entry in the left menu).
- **My reports** and **Shared reports** lists (name, who can see it, what's in it, owner, updated; Open / Edit / Copy / Delete).
- **+ New report**: name, description, **Private** (only you) or **Public** (everyone in your organisation), then tick the tiles to include: KPI tiles, Deals by stage, Headcount summary, People by role, Regions, Teams, Report activity log. Optionally tick **Include a Board report setting** (financial year, period, prior-year comparison) — the report then shows a button that opens the Board report in Strategy with exactly that period chosen (Strategy applies it once, then tidies the address).
- Opening a report stacks the chosen tiles (KPI tiles stay clickable) and can be printed. Every open, save and delete is written to the report activity log.
- **A saved report is a recipe, not data**: each person sees the figures their own role/region access allows. Public sharing never exposes anyone's numbers.

## Rules (enforced in the database, not just the screen)
- Anyone in the organisation can make **private** reports; only the owner sees, edits or deletes them.
- **Public** needs a role with **Publish** or **Configure** (or a platform admin). The owner edits/deletes their own; a **Configure** role (or platform admin) can also edit/remove a *public* report (moderation) but never sees anyone's private one.
- Owner and organisation can't be changed after creation. If an owner's login is removed, their public reports stay (owner shown by saved name).
- **Copy** makes a private copy you can change.

## Not included (say if you want them)
- Drill-down graph and Relationship map as report tiles (they are interactive with their own state); Strategy's Board report layout/commentary beyond period + comparison; scheduling/emailing a saved report; reordering tiles (they follow the list order above).
- Saved reports are per organisation (the one you're viewing).

## Files
- `Reporting.html` (new page, Reports button, 2 FAQ entries) · `Strategy.html` (reads the Board setting from the link) · `shared/savedReports.js` (new, rules) · SQL + rollback.

## Rollback
Code: `git checkout pre-saved-reports-2026-10-10 -- Reporting.html Strategy.html` (or copy back `archive/2026-10-10-pre-saved-reports-Reporting.html` and `archive/2026-10-10-pre-board-link-param-Strategy.html`). Database: run the ROLLBACK file (it deletes the saved reports; back up first as noted in it).

## Tested
- 19 rule checks (`2026-10-10-savedReports-test.js`).
- 30 screen checks against a fake database that mimics the policies (`…-savedReports-page-test.js`): privacy, create/edit/copy/delete, publish gating, moderation, escaping, board link, missing table, errors.
- 5 checks on the Strategy link handling (`…-boardLink-param-test.js`).
- **Not tested:** the real SQL policies (needs you to run the migration), and the live page. After pushing and running the SQL: make a private report, a public one (as a Publish/Configure user), then check a plain member sees the public one but not the private one.
