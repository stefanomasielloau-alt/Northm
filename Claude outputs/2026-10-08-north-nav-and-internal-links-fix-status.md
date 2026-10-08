---
title: North top nav + internal links repointed to renamed module files (2026-10-08)
description: The top navigation menu in every North module (and the Home tiles, search and all in-page "Open ..." links) still pointed at the pre-rename file names; fixed, with verification and the live checks Stef should do. Includes the Board report links.
sources: [cowork session 2026-10-08]
---

# What was wrong
The 2026-10-07 rename moved the files (Ordo.html -> Strategy.html etc.) but each module's `MODULES` list still built nav links as `<id>.html` with the old ids, so the top menu in every module and many in-page links pointed at pages that no longer exist. (Hub and Queue menus were fixed earlier today, Hub-Backend `1fc5aeb`.)

# What changed (Northm commit `b25713f`, local until pushed; no SQL)
- **Nav:** every `MODULES` entry (10 files) gets a `file` field (Strategy, CampaignPlanning, Events, AssetRegister, Targets, Scoring, ProcessMaps, Configuration, Reporting). The old `id` stays as the internal key, so module access/permissions are untouched. Nav links, nav search ("tnPick") and window names now use `file`.
- **In-page links** (47 literal fixes): all "Open Campaign Planning / Configuration / Scoring / Targets / Events", Campaign and Event deep links (`CampaignPlanning.html#campaign=`, `Events.html#event=`), Assets > Scoring won-deal links, Assets > Targets Reference tracking, Process Maps record links, Reporting's drill-through links, Strategy's "Reporting" breadcrumbs and Relationship-map link, and the **Board report** links (Reporting > `Strategy.html?page=boardreport`; Strategy > Back to Reporting).
- **Window names** (`tool_Strategy` etc.) now match the Hub menu so the same tab is reused.
- **Home page tiles** (index.html) had correct file links but old window names; fixed.
- **User-visible old names** in text: Events (3 places said "Custodia"), Configuration currency help and a tooltip, Scoring hint, and 4 sentences in field-guide.html. Deliberately NOT changed: the codename tags shown in the Field Guide's contents list, console messages, comments, and internal data labels (`source:'Cursus'`, `module:'Ordo'` etc. are stored values).

# Verified (static + simulated)
- All 10 `MODULES` lists resolve: every `file` exists and maps to the right module.
- No remaining link anywhere in the 10 modules, shared scripts or field guide points at a file that doesn't exist.
- Rendered the real nav function for Strategy, Reporting and Configuration: all links correct.
- Deep-link receivers confirmed to exist: `?page=boardreport` (Strategy), `?page=relmap` and any page id (Reporting, Targets, Scoring incl. q/campaign), `#campaign=`/`#page=` (Campaign Planning), `#event=` (Events).
- All inline scripts still parse. NOT clicked in a live browser.

# Live check after push + hard refresh (10 min)
1. Click every item in the top menu from 2-3 different modules (Strategy, Reporting, Configuration): each opens the right module; clicking again reuses the same tab.
2. Home page: click each module tile.
3. Board report: Reporting > "Open Board report" lands on Strategy's Board report; its "Back to Reporting" returns.
4. Strategy > a campaign "Open" button lands on that campaign in Campaign Planning; Campaign > "Open in Events" lands on the event.
5. Assets > a campaign link and a won-deals link; Process Maps > a record link.
6. Nav search box: type "events", pick the result.
Backups: `archive/2026-10-08-pre-nav-links-*.html` (11 files).
