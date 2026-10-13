# 2026-10-14: Advanced reports (paid add-on), dashboard report tiles, saved Relationship map views

Stef (09:32): chart-library elements in saved/custom reports = advanced, pay-more feature; switched on per org (check box in Config); then All or Selected people can create; everyone sees the org's public shares. Reports dashboard Edit layout: insert custom reports (visibility-controlled) and saved Relationship map views (named, public/private, frozen to a date and time, or live).
Decisions: switch = Licensing add-on; saving map views = basic for everyone; report tile = both (one report, or a list); build all in one go.

## Run order
1. Run `2026-10-14-migration-advanced-reports-and-map-views.sql` (additive; rollback alongside).
2. Push Northm.
3. Super Admin: Configuration > Admin > Licensing > the org's plan > **Reporting add-ons > Advanced reports** (tick + price). Plan must not be expired/cancelled.
4. Org admin: Configuration > Roles & users > **Advanced reports** > All people / Selected people.

## What changed
| Area | Change |
|---|---|
| Licensing (Configuration) | "Advanced reports" add-on checkbox + price on each org's plan; included on generated invoices. |
| Roles & users > Advanced reports (new tab) | Shows whether the add-on is active; org admin picks All people or Selected people (people picker). |
| Database | `org_plans.advanced_reports_addon/_price`, `org_settings.advanced_reports_creators`, functions `advanced_reports_enabled()` / `advanced_reports_can_create()`, a guard trigger on `saved_reports` that refuses chart-library elements from anyone not entitled (editing a report without changing its elements is always allowed), new table `relationship_views` with the same private/public/moderation rules as saved reports. |
| Reporting > Saved reports | Editor has a **Chart library** section (Advanced): any of Reporting's 16 tiles across Dashboards, Organization, Drill-down, Reports and Relationship map, plus the org's custom widgets (notes, Sheets/Docs, API/webhook). Not entitled: a short explanation instead; existing elements in a report stay but can't be changed; copying an advanced report without entitlement leaves them out (with a note). Viewing is open to everyone who can see the report. |
| Dashboards (any Reporting page) > Edit layout > + Add tile | New groups: **Saved reports** (one report: name, description, contents, Open), **Saved reports (list)** (mine + shared), **Saved relationship map views**. Only reports/views you can see are offered. |
| Relationship map | **Save view** button: name, Private/Public, **Live** (redrawn from current data) or **Frozen** (picture as at the save time, marked "Frozen · as at …"). New **Saved views** tile lists them (open / delete). Tiles show the map read-only with "Open in Relationship map". |
| shared/grid.js | Generic hook so a module can add tile sources (used for the three groups above); exposes the widget resolver so saved reports can draw custom widgets. Strategy unaffected. |

## Tested
All scripts parse; 14 Reporting checks (library for entitled / not entitled, copy rules, element rendering, tiles, live and frozen views, frozen save contents, error wording) + 4 grid checks; earlier suites still pass. SQL syntax checked. Not yet clicked live (needs migration + push).

## Limits
- Strategy-only charts (e.g. Drivers & rates) aren't in the chart library: they need Strategy's data, which Reporting doesn't load.
- "Saved views" tile appears for new layouts; an existing Relationship map layout can add it via + Add tile.
- Frozen pictures over 3 MB are refused (narrow the map or save as Live).
- New features have no in-app FAQ entries yet.

## Live checks after push
1. Licensing: tick Advanced reports for Tac-Tik's plan. 2. Roles & users > Advanced reports shows Active; try Selected people.
3. Saved reports > New: Chart library list appears; save one with Relationship map + Deals by stage; open it.
4. Untick the add-on: editor shows the explanation; existing report still opens.
5. Relationship map: pick a campaign > Save view (Frozen) and another (Live). Dashboards > Edit layout > + Add tile: add both + a saved report + the list.
