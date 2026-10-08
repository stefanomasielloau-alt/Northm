---
title: "Talk to this screen" (universal voice/field fill) - built + test checklist
description: Every North module now has a "Talk to this screen" button that detects the editable fields on screen, lets you speak/type an instruction, and shows a review before changing anything. Includes the test checklist for Stef.
sources: [cowork session 2026-10-08]
---

# Status - 2026-10-08 (second build today)

One local commit, needs `git push`. No SQL.

## What it is
A floating **"Talk to this screen"** button (bottom right, left of the red feedback button) on Strategy, Campaign Planning, Events, Assets, Targets, Scoring, Configuration and Reporting (NOT Process Maps - no AI router / it is a canvas). Click it: the mic starts (Chrome/Edge), say what you want ("set Hall B pax to 40 and mark it confirmed"), click Stop -> it goes straight to a **review**: current vs proposed for each field it would change. Tick, edit if needed, **Apply**.

How it works: it scans the editable fields visible right now (inside an open dialog if there is one, otherwise the page's main area), names each by section > table row (row name) > column, sends those names + current values + your words to your org's AI (same router as the other AI features), and applies accepted values the way a person types them (so each page's own save/role/audit logic runs). Each value is re-read afterwards; anything the page didn't keep is reported as "skipped".

## Limits (honest)
- Only fields **visible on screen**. It cannot add table rows or create records (use the page's Add buttons; on Events, "Fill from brief" can add venues/speakers).
- Skips password/secret/token/card-looking fields, search/filter boxes, hidden and disabled fields. Checkboxes, radios, times and drag/resize widgets (e.g. Strategy tile layouts, Process Maps canvas) are not touched.
- Max 120 fields per screen. Field names and current values on screen are sent to the AI (disclosed in the panel).
- Speech: Chrome/Edge only. Typing/pasting works everywhere. If you click Stop with nothing said, nothing is sent.
- A "Can I talk to a screen and have it fill in?" help entry is added to each module's Help panel automatically.

## Tested (headless, fake AI + fake speech)
FAB appears once the page is drawn; 11 fields found incl. table cells with row names + a rich-text box; password/API-key/search/hidden/disabled skipped; mic auto-starts; Stop auto-proposes; values applied correctly across page re-renders (name, money "$40,000", select, date, table cells in the right rows, rich text appended); a page that silently refuses a value is reported "skipped"; view-only role blocked; an open dialog scopes the scan. Earlier panel/Word/folder tests re-run: pass.

## NOT tested (needs you, after push + hard refresh)
Real microphone, real AI answers, and every real module's screens. Likely trouble spots: pages whose inputs are built unusually, labels that read oddly, and Strategy's big tables.

## Test checklist (suggested, ~15 min)
1. Events > open an event: click "Talk to this screen", say "set the status to confirmed and the budget to forty thousand". Expect a review with Status + Budget; Apply; confirm the page shows them and refresh keeps them.
2. Events venues table: say "set the PAX for <your venue name> to 250". Expect the right row only.
3. Strategy > Admin & config (a table page): say "change <a rate/name> to <value>". Check label wording in the review is understandable.
4. Campaign Planning, Targets, Scoring, Assets, Reporting, Configuration: open one screen each, click the button, type (not speak) "list nothing, just test" - expect either a sensible "nothing found" review or fields; no errors in the console (F12).
5. Try as a view-only user (if you have one): button opens a "view-only" notice, nothing changes.
6. Say something ambiguous ("make it bigger") - expect an empty review, not guesses.
7. Safari: button shows, mic is disabled with a tooltip; typing still works.
8. Report anything odd: which module/page, what you said, what the review showed.

## Files
- shared/aiFill.js (extended: universal scan + button + help entry + prompt carries current values)
- Strategy.html, CampaignPlanning.html (already loaded), Events.html (already loaded), AssetRegister.html, Targets.html, Scoring.html, Configuration.html, Reporting.html - one script tag each
- Claude outputs/2026-10-08-talk-to-this-screen-status-and-test-checklist.md (this note)
