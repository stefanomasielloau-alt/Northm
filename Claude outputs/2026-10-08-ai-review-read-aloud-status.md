# AI review, read-aloud and draft creation — status (2026-10-08)

## What was built (Steps 1 and 2)
Ask Alec (the right-hand panel in Strategy, Campaign Planning, Events, Asset Register, Targets, Scoring, Reporting) now has a bar at the top:

| Control | What it does | AI call? |
|---|---|---|
| Alert chips (red / amber / green counts) | Counts what North itself already marks on the visible screen (`.pill bad/warn/ok`, `.note w/b/g`). Click a chip for the list; click an item to scroll to it. | No |
| 🔊 What's on screen | Instant written + spoken briefing built from those flags. | No |
| ✦ Review this screen | One AI read: headline, what is working, what needs attention, recommended activities / campaigns. Same pipe, org switch and data limits as Ask Alec chat. | Yes (1) |
| Read aloud (per message, and auto-read option) | Browser text-to-speech, sentence-chunked, pause / stop, voice + speed saved per browser. Stops on page change or close. | No |
| Create draft / Draft in Campaign Planning | Campaign Planning opens its New campaign form pre-filled, or a Draft activity dialog. Other modules hand the suggestion over to Campaign Planning. **Nothing is created until you press Create there.** | No |

Strategy and Campaign Planning also carry module-specific review focus text (plan vs target, over-budget campaigns, weak activities, unallocated budget).

## Files changed (Northm, committed locally: `e24e1d4`, `76cd5af`)
| File | Purpose |
|---|---|
| `shared/alecReview.js` (new) | The whole feature; auto-loaded by askAlec.js. If it fails to load, Ask Alec works as before. |
| `shared/askAlec.js` | Small hooks so the add-on can attach. Backup: `archive/2026-10-08-pre-review-askAlec.js`. |
| `Strategy.html` | Review focus text. Backup: `archive/2026-10-08-pre-review-focus-Strategy.html`. |
| `CampaignPlanning.html` | Review focus text, draft campaign / activity flow, hand-off receiver. Backups: `archive/2026-10-08-pre-review-focus-CampaignPlanning.html`, `archive/2026-10-08-pre-draft-CampaignPlanning.html`. |

## Tested here vs not tested
- **Tested (headless browser, fake AI and fake speech): 30 checks pass** — chips, flag list, briefing, review rendering, prompt contents, non-JSON fallback, error + retry, voice / speed, stop on page change, hand-off payload, draft dialog creates exactly one Planned activity, campaign draft pre-fills only, stale hand-off ignored.
- **Not tested (cannot from here):** real AI answers (quality of reviews on your live data), real browser voices, real Campaign Planning boot with your data, the 7 other modules' screens.

## Live checks for Stef (after hard refresh)
1. Open Strategy → Dashboard → Ask Alec. Confirm the bar shows and chips match the red / amber you see.
2. Click **What's on screen** — it should speak and write a short briefing.
3. Click **Review this screen** — expect Working / Needs attention / Recommended. Check the evidence lines match the screen.
4. Click 🔊 Read aloud on the review; try pause, stop, and the 🎙 voice / speed settings.
5. On a *campaign* recommendation click **Draft in Campaign Planning…** — a Campaign Planning tab should open with the New campaign form pre-filled and nothing created.
6. In Campaign Planning → Planning, run Review and click **Create draft…** on an *activity* recommendation — the Draft activity dialog should open; Cancel creates nothing.

## Known limits
- Alerts come only from what the app already marks on screen; no new business rules were invented. Module-specific rules can be added through the `alerts` option.
- Campaign drafts leave dates, budget, region and programme for you to set.
- The AI sees the same on-screen snapshot as Ask Alec chat (never password fields, no raw contact records).

## Step 3 — organisation's own voice provider (NOT started, needs your decision)
Needs a new Hub-Backend endpoint, an encrypted per-org key table and a SQL migration you would run, plus a Configuration card. Recommended default: OpenAI text-to-speech first (the org already can add OpenAI keys), others later. Decision needed: which provider(s) you want first.

[STATUS: PARTIAL – NEED CLARIFICATION]
- Steps 1 and 2 done, tested headless and committed locally (not pushed).
- Step 3 waiting on provider choice.
