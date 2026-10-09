# Board report — per-person override (option C) built 2026-10-09

Built and committed locally; **not pushed, SQL not run**. Until the SQL is run the app behaves exactly as option B (role only) and no new control is shown.

## What it does
- Configuration → Users gets a **Board report** column (only once the SQL below has been run): *Follow role (yes/no)*, *Always allow*, *Always block*.
- Rule: platform admin (Super Admin) always sees it → else the person's override if set → else their role's Board report setting.
- "Always block" hides the Board report menu link, the Reporting button and the page for that person, even if their role is approved. "Always allow" does the opposite.
- It hides the link and page, not the underlying numbers (same as option B).

## Safe order
1. Push Northm (nothing visible changes).
2. Run `2026-10-09-migration-board-report-person-override.sql` in Supabase (adds `profiles.board_report_override`, default empty = follow role).
3. **Run the SECURITY CHECK query in that file once** and send me the result: people must not be able to change their own override.
4. Hard refresh Configuration → Users; set a test person to *Always block*, sign in as them (or ask them) and confirm no menu link / no-access panel.

## Rollback
- Data/feature off: `2026-10-09-migration-board-report-person-override-ROLLBACK.sql` (drops the column; pages revert to role-only automatically).
- Code: `git checkout pre-board-override-2026-10-09 -- Strategy.html Reporting.html Configuration.html shared/boardReportAccess.js`, or copy back `archive/2026-10-09-pre-board-override-*`.

## Tested
- 16 new checks on the rule with a fake database (override true/false/null, no profile row, platform admin ignores a block and makes no extra query, column missing in both error forms, other errors and network failure fail closed, explicit override wins, role-flag column missing = feature off) plus the earlier 19 checks still passing against the patched file.
- Syntax checks of the three pages.
- **Not tested:** the Users-table control in a browser (needs the SQL run first) and real sign-ins as different people.
