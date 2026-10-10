# Four small fixes - 2026-10-10 (round 2)

Committed locally in Northm; **not pushed**. No database change.

## 1. Send test to me - colour (ProcessMaps.html)
Button is now **North Orange #F26A2E** (sampled from the orange arrow in the North logo; no orange hex was written down anywhere, so tell me if the official value differs - it is one CSS rule, `.btn.north-or`). Bold white text, darker orange on hover.

## 2. Send test to me - "Failed to fetch" (ProcessMaps.html)
**Cause:** the `flow-test-send` Edge Function is not deployed yet. Confirmed live: a GET to its address answers 404 "Requested function was not found", while the already-deployed `flow-runner` answers 200. When a function does not exist, the browser's permission check for a POST gets an answer with no CORS headers, so the browser throws a bare "Failed to fetch" and my earlier "not installed yet" message never got a chance to show.
**Fix:** after such a failure the button now makes a plain GET to the same address: 404 shows the "not installed yet - deploy flow-test-send" message; anything else shows "Could not reach the test sender...". The raw "Failed to fetch" is never shown.
**You still need to deploy the function** (steps in `2026-10-10-flow-test-send-setup.md`) before a test email can actually send.

## 3. Deals by stage - combo chart (Reporting.html, shared/chartsCombo.js)
Dashboards > Deals by stage is now a combo: **deal value per stage as bars (left $ axis) with the deal count as a line (right axis)**. A button swaps them (count as bars, value as the line). The existing Combo / Bars / Stacked / Lines switch and hover values work too. The table gained a Value column. Value includes closed stages (it is deal value by stage, not strictly "open pipeline"). If the helper fails to load, the old count bars show. Saved reports that include this tile get the new chart automatically.
The "Open pipeline" KPI tile's click-through chart (top 8 deals by value) is unchanged - say if you want that one as a combo too.

**Related fix found while doing this:** pages declare `const F` at top level, which is not visible as `window.F`, so the combo helper had been drawing axis labels as raw digits ("$1250000") and ignoring the page colour palette - on Strategy's Board report charts too. `shared/chartsCombo.js` now reads the page's own `F` and `SER`. Verified by test (axis labels now read like $2.5M).

## 4. Effectiveness - click through to campaign (CampaignPlanning.html)
On Campaign Planning > Effectiveness > By campaign the campaign name is now a link (with an arrow) that opens that campaign's detail panel. (Assets > Effectiveness already linked to the campaign.)

## Rollback
`git checkout pre-simulate-orange-fetch-2026-10-10 -- ProcessMaps.html` and `git checkout pre-combo-deals-effectiveness-link-2026-10-10 -- Reporting.html CampaignPlanning.html shared/chartsCombo.js`, or copy back the `archive/2026-10-10-pre-simulate-orange-fetch-*`, `…pre-combo-deals-*`, `…pre-effectiveness-link-*`, `…pre-combo-global-F-*` files.

## Tested
- ProcessMaps page test (real flow engine, fake endpoint): 21 checks incl. orange class, deployed-vs-not detection, no raw "Failed to fetch".
- Combo/Effectiveness test (11 checks): axis formatting with a page-style `const F`, chart + swap button + table, empty state, fallback without the helper, Effectiveness link opens the right campaign, names stay escaped.
- Syntax check of all changed files. Not viewed on the live site (needs the push).
