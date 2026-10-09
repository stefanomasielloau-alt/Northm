# Board report access — option B built (2026-10-09)

Built and committed locally; **not pushed, migration not run**. Nothing on live changes until you push AND run the migration.

## What it does
A new role setting, **Board report** (Configuration → Roles, new column after "Expert mode allowed"). When ticked for a role:
- **Strategy:** "Board report" appears in the left menu (Measure group) and opens in both Simple and Expert mode.
- **Reporting:** the "Open Board report" button is shown.
Everyone else: no menu link; the Reporting card says "Available to approved roles only"; opening the Board report by direct URL shows a short "available to approved roles only" panel.
**Platform admins (Super Admin) always have access** once the feature is on.

## Safe order (any order works, this is the cleanest)
1. Push Northm. Until the migration is run the app behaves exactly as today (Board report hidden from the Strategy menu, still reachable from Reporting).
2. In Supabase SQL editor run `2026-10-09-migration-board-report-access.sql`. It adds `roles.view_board_report` (default off) and switches it ON for roles that already have Configure, so admins aren't locked out.
3. Hard refresh. Configuration → Roles now shows the "Board report" column. Tick the roles you approve.
4. Check: as an approved role the menu link shows and the page opens; as an unapproved role there is no link, the Reporting button is replaced by a note, and `Strategy.html?page=boardreport` shows the no-access panel.

## Design points
- One rule in one file, `shared/boardReportAccess.js`, used by Strategy and Reporting. A missing column = "feature not installed" (behaves as today). Any other error (network, permissions) = no access (fails closed).
- Only the role flag is read, via a separate small query; the existing roles loads are untouched.
- New roles start OFF; cloning a role copies the setting. Roles auto-created for a brand-new organisation also start OFF, so that org's admin ticks it once (platform admins can always see it).
- It hides the menu link and the page. It does not hide the underlying numbers, which people can already see on other Strategy pages under their organisation permissions.

## Option C later (per-person override) — already prepared for
`NorthBoardReportAccess.load()` already accepts `userOverride` (true/false beats the role; null follows the role); it is tested. To add C: (1) add `profiles.board_report_override boolean` (null = follow role), (2) a control in Configuration's Users table, (3) pass `userOverride:_myProfile.board_report_override` at the two call sites (Strategy, Reporting). No change to the rule itself.

## Rollback
- **Switch the feature off without touching code:** run `2026-10-09-migration-board-report-access-ROLLBACK.sql` (drops the one column; pages revert to today's behaviour automatically). Save the ticked roles first with the select at the top of that file if you want them back later.
- **Restore code:** `git checkout pre-board-access-2026-10-09 -- Strategy.html Reporting.html Configuration.html` (tag = commit bc5e47b), or copy back `archive/2026-10-09-pre-board-access-*.html`. `shared/boardReportAccess.js` can then stay unused.
- **Undo the commit:** `git revert <this commit>`.

## Tested / not tested
Tested: 19 helper checks (role true/false/null, missing column both error forms, other errors, network failure, platform admin, future override) and 5 wiring checks (before migration; approved; unapproved; platform admin; query error); syntax check of all three pages. **Not tested:** the real pages and database (needs push + migration + your click-through of step 4).

## Open request received while building
"Option to change layout on board report" — see the question in chat; not started.
