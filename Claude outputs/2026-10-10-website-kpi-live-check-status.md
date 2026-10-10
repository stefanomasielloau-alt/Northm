# Status — website v2, KPI spec, video plan, live check, Reporting rule (2026-10-10)

## Delivered (docs, in Northm "Claude outputs" and the Project)
- `2026-10-10-website-copy-v2.md` — messaging, voices (labelled illustrative, not testimonials), what North is not, features, BYO AI, results with verified sources, pricing + paid support (proposals), video page.
- `2026-10-10-contribution-to-closed-pipeline-kpi-spec.md` — definition, what exists, 6 gaps, 4-stage build, 5 questions.
- `2026-10-10-video-plan-and-scripts.md` — can-I-produce answer, 5 footage options incl. AI-generated, 2-min script + 4 dives, AI-video prompts, checklist.

## Live check (read-only, northm.vercel.app, signed in as Super Admin)
- Reporting → Deals by stage: combo chart renders; swap button works both ways. PASS
- Campaign Planning → Effectiveness: 4 campaign click-through links; 1 closed-won deal loaded. PASS
- Budget line items: 3 exist; roll-up helpers loaded on the page. PASS (figures not eyeballed per campaign)
- Duplicate programme names (backlog #16): REAL duplicate records in org Tac-Tik — "Enterprise Growth FY27" (ids 6bfd19ba…=1 campaign, 79892a17…=4 campaigns) and "Always-on Demand Gen" (454a9a8f…=0 campaigns, 1cbb539e…=3 campaigns). Not a code bug. Nothing deleted. Suggest archiving the empty "Always-on Demand Gen" (454a9a8f) only after you confirm.
- Not checked live: Simulate Send test (blocked until provider key is set); Reporting line-item rule (not pushed yet).

## Code (Northm, local commit 3b27962, NOT pushed)
- `Reporting.html`: campaign Committed/Actual follow the one line-item rule for own-org users; Super Admin all-organisations view unchanged (no cross-org read for budget_line_items/tasks — would need new admin RPCs + security check); 2 Help/FAQ entries. Archive `archive/2026-10-10-pre-reporting-lineitem-rule-Reporting.html`, tag `pre-reporting-lineitem-2026-10-10`. Logic check: 3-case rollup test passes; inline scripts syntax-checked.

## Still needs you
1. Email provider key + secrets, and Verify JWT OFF on flow-runner (reminder scheduled).
2. Decisions: pricing numbers; KPI questions (spec §5); footage route and demo org for screen captures; website items (domain, support email, legal answers).
3. Push 3b27962 when happy, then re-check Reporting as a non-super-admin user.
