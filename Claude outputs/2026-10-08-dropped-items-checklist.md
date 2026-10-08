# Dropped-items check — verified status (2026-10-08)

Read-only. Source: project docs (search + targeted reads) and a grep of Northm code. No code changed.

## Correction to my earlier addendum
Two items I listed as "dropped" are **already built**. My addendum was wrong on these; it has been corrected.

| Item | Verified status | Evidence |
|---|---|---|
| Pod-level rate / stream-mix overrides | **BUILT** (pod > region > global, plus 2 Geography widgets) | 2026-09-28 backlog-build-handover; `pod_gate_rates` present 6x in Strategy.html |
| Real PPT export for Board report | **BUILT and pushed** (Northm `b2bde66`, Hub-Backend `d7a6ca1`) | 2026-09-03 backlog doc; `board-report-pptx` call present in Strategy.html |

## Genuinely still open

| # | Item | What is needed | Who |
|---|---|---|---|
| 1 | `v7` RLS bypass-closure (commit `9cb7607`) — unconfirmed for 10+ refreshes | In Supabase run: `SELECT policyname FROM pg_policies WHERE policyname LIKE '%_super_admin_all';` — **zero rows = v7 ran**. If rows return, run `2026-09-10-super-admin-rls-v7-drop-remaining-bypass.sql` (not v6). | Stef (I have no DB access) |
| 2 | Item 47 Reporting drill-down — "doesn't seem to be working", never re-confirmed | Open Reporting, click the drill-down graph chain Programme > Campaign > Activity > Assets, slice by region/pod. Report what breaks (blank graph? no click-through? console error?). | Stef, 5 min |
| 3 | Multi-org auth-consolidation test | Needs an Admin/Super-Admin North session: test Hub-accounts list / create / role-change in Configuration. | Stef |
| 4 | Company Signals weekly digest | Template seeded and an Activate switch exists, but activating does **not** run anything — a scheduled-execution engine is still unbuilt. Stef said "do not activate yet". | Stef decision |
| 5 | Strategy: Drivers & rates stale heights | Click **Reset layout** once on that page in your own browser. | Stef, 10 sec |
| 6 | Pod-level "Unassigned" row — add a Remove option? | Judgment call, not a bug. | Stef decision |
| 7 | Widget library: no auto-resize for cross-page widgets | Deliberate gap, not a bug. | Parked |
| 8 | Other unconfirmed migrations: `region_streams`, `campaign_execution_status`, `profile_orgs` (relevant to Oct 30 grant change) | Same check style: confirm each table exists in Supabase. | Stef |
| 9 | Item 37 Privacy / T&Cs — 7 questions unanswered | `claude/2026-10-07-item37-privacy-tcs-quick-answers-needed-v2.md` | Stef |

## Not verified by me
Whether anything in rows 1, 3, 8 has actually been run — I have no database access. Row 2 needs a live look.
