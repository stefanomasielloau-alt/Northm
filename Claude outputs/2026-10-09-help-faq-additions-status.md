# Help / FAQ additions — 2026-10-09

Committed locally in Northm; **not pushed**. Text only (each module's `HELP_FAQ` list); no behaviour or database change.

## What was added (12 entries across 8 modules)
| Module | New entry |
|---|---|
| Configuration | Where do I enter my CRM or advertising app credentials? · What is the Redirect URL on the connectors page? · Where did the Configuration menu items go? · How do I set up read-aloud voices? |
| Strategy, Campaign Planning, Events, Asset Register, Targets, Scoring, Reporting | Can Ask Alec read answers aloud or review what is on my screen? |
| Campaign Planning | Can I start a campaign from a PDF? |

## Of the 8 proposals in the 1409 findings
- **#1 (Process Maps connectors wording)** — already done in the flows connector change (commit fba6a9b).
- **#6 ("Talk to this screen")** — not needed: the shared voice-fill script already adds that entry to every module's Help at runtime, so my earlier "none exist" was wrong (I only searched the static files).
- **#8 (PDF as a brief)** — already in the Events entry ("Fill from brief" lists text-based PDF). The only module with an upload-a-document path besides Events is the Campaign Planning wizard, so the new entry went there; Strategy has no brief upload.
- **#2, #3, #4, #5, #7** — added as above.

## Rollback
`git checkout pre-faq-additions-2026-10-09 -- <the 8 module .html files>` or copy back `archive/2026-10-09-pre-faq-additions-*.html`.

## Tested
Each patched FAQ list evaluates (entry counts 12–22, no duplicate questions), every module's inline scripts pass a syntax check, and answers contain no characters the Help panel would show literally (the panel escapes text). Not viewed in a browser.
