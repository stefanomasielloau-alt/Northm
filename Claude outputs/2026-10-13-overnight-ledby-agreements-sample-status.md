# 2026-10-13 (night): Led by pre-fill, partner targets from agreements, wording, sample data

Stef's answers (22:55): 1 prefill, 2 targets follow agreement dates, 3 fix wording, 4 explain no-segment campaigns, 5 add sample data if needed. Done unattended.

## Done live (already in the database)
- **Led by pre-filled on all 12 Tac-Tik campaigns** from each campaign's activity route: 2 Partner-led (Partner Co-Sell Q3, RLS TEST CAMPAIGN), 2 BDR-sourced (SDR Outbound Wave 3, Japan Key Account ABM), 8 Marketing-sourced. Read back from the database. Before = all blank. Undo: `2026-10-13-ledby-prefill-undo.sql`.

## Built, needs your push (Northm, not committed)
- **Partner targets follow agreement dates** (Campaign Planning > Partners > Details): each row under "Contacts / agreements" now has a **$ target** for that agreement's whole term. Each financial year's target = each agreement's target pro-rated by the days it falls in that FY (e.g. a 1 Jan-31 Dec 2026 agreement for $365,000 with a July FY start = FY26 $181,000 + FY27 $184,000). When a partner has an agreement with a target and both dates, its FY targets are calculated and read-only (table shows "agr."), and are saved to the FY targets / single target so Reporting matches. Partners without agreement targets keep typing a target per FY.
- **Wording**: Admin > Campaigns intro now says new campaigns are "ready to have its Led by and Segments set below (and its activity, which sets cost per lead, on Campaign & cost > Business case)".
- **No-segment campaigns** now show "— choose — ⚠" with a clear tooltip instead of a confusing "adds up to 0%".
- Files: `CampaignPlanning.html`, `Strategy.html`. Archives: `archive/2026-10-13-pre-agreement-targets-*.html`.
- Tests: scripts parse; agreement maths (7 checks incl. leap year and calendar-FY orgs), Partners page render (4), earlier Strategy (30) and Campaign Planning (9) suites re-run, all pass. Not clicked in a live browser yet (needs the push).

## Needs you to run (optional, demo org only)
- `2026-10-13-bodgit-scarpa-sample-targets-ledby-agreements.sql` -- Bodgit&Scarpa only, fills blanks only: Led by (from activity, else campaign name), lead/pipeline targets (expected leads +10%; pipeline = 6 x budget), actual leads for started campaigns, links its deals to campaigns by the campaign name they already carry (so pipeline actuals show), and one sample agreement with a target per partner. Everything touched is backed up first; undo with `2026-10-13-bodgit-scarpa-sample-UNDO.sql`. Syntax checked with a Postgres parser; not run. Why SQL: the browser can't read or write another org's data under the current access rules.

## Item 4 -- what the ⚠ on two campaigns means
"RLS TEST CAMPAIGN" and "Denn campaign" have no segment because they were started in Campaign Planning, which never sets one. It is correct to flag them: until a segment is picked, their conversion uses the base rate with no segment adjustment (same as before today's changes). Pick one in Admin > Campaigns > Segments to clear it.

## Still open
- Reporting groups by main segment only; no expected pipeline benchmark; actual leads typed in; Led by options can't be renamed/removed; Campaign Planning shows no expected closed-won.
- Campaigns started in Campaign Planning will keep arriving with no segment and no Led by -- could default them (e.g. Unassigned segment, Led by from owner/activity) if wanted.
