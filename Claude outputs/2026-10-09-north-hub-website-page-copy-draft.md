# North / Hub website — page-by-page draft copy (v1, 2026-10-09)

Builds on `2026-09-02-north-hub-website-content-brief.md` (sitemap, audience, tone) and `2026-09-02-north-hub-tool-overview-draft.md` (your polished-from copy). Structure follows the gainencore.ai pattern you chose: hero → trust → value → numbered "how it works" → capabilities → outcomes → "no big lift" → CTA. Plain tone, no buzzwords, no invented numbers, customers or logos.

**How to read it:** `[Stef: …]` = a decision or fact only you can supply. `[VERIFY]` = a claim that is built but you haven't yet seen working live — keep, soften or cut after your own test. Section "Claims check" at the end lists every claim and its evidence.

---

## 1. Home

**Headline:** One plan, one place.
**Sub-headline:** North connects your go-to-market strategy, campaigns, events, assets, targets and scoring in a single system — with Hub carrying the contacts and outreach that execute it.
**Primary button:** Request a demo `[Stef: where does this go — contact form, email, calendar link?]`  **Secondary link:** Sign in

**Why teams switch** (trust beat — security and control, since there are no logos yet)
- Every organisation's data is separate: access is enforced in the database, not just on screen.
- Roles decide who can view, edit, publish and configure — set per organisation, per person.
- AI only ever drafts. You review and approve before anything is created.

**The problem we fix**
Planning usually lives in five places at once: a deck for the strategy, a spreadsheet for the funnel maths, a project tool for campaigns, a CRM for contacts, and somebody's inbox for the brief that started it all. Every quarter, someone rebuilds the same numbers by hand and hopes they still agree.

**How it works** (numbered flow)
1. **Set the plan.** Model your funnel by region, stream and segment — top-down targets beside a bottom-up build.
2. **Plan the campaigns.** Turn the plan into campaigns, activities and budgets that stay tied to the numbers that justified them.
3. **Run events and manage assets.** Events and assets share the same campaigns and cost lines.
4. **Target and score.** Define the customers you want, score deals against the plan, and forecast.
5. **Automate and report.** Process Maps turn repeat work into flows; Reporting follows any campaign out to its activities, assets and partners.

**No big lift** (objection-handling beat)
No migration project. Sign in, bring a brief or your current plan, and North helps fill it in — you check every field before it's saved. `[VERIFY: fill-from-brief live test]`

**Closing CTA:** See North with your own plan. → Request a demo

---

## 2. Product — how the modules fit together

Lead with the chain, not a feature grid:

**Strategy** sets the plan: gates, conversion rates, regions, pods, streams, segments and drivers; a quick calculator for fast what-ifs and a planning engine for the full build; board-report page with PowerPoint export. `[VERIFY: PPT export live]`
**Campaign Planning** executes it: campaigns, activities, budgets, sign-off, partners, templates.
**Events** and **Assets** support it: event planning, speakers, venues, checklists and costs; a register of physical and digital assets with stock and transactions.
**Targets** and **Scoring** close the loop: ideal-customer filters and reports; deal scoring with a configurable model and forecast.
**Process Maps** is the machinery: flows, system processes, automation bundles, runs and approvals.
**Reporting** reads across everything: dashboards, organisation view, a drill-down graph from programme to campaign to activity to assets, and a relationship map.
**Configuration** is the one place for roles, cost buckets, partners, tracking IDs, naming, AI providers and integrations.

Closing line: Every module reads and writes the same data — change a number in Strategy and Campaign Planning shows it, with nobody re-typing.

---

## 3. AI — drafts you approve

**Headline:** AI that reads your brief, not a chatbot bolted onto a form.

- **Fill from a brief.** Drop in a Word, text or PDF brief, or speak it. North pulls out names, dates, budget, objective, audience and key messages into a draft. `[VERIFY]`
- **Talk to this screen.** Say what should change; North fills the visible fields the way you would, and tells you what it skipped. `[VERIFY]`
- **Ask Alec.** An assistant that reviews what's on screen — what's working, what needs attention, what to do next — and can read answers aloud. It can open a pre-filled draft; **nothing is created until you press Create.** `[VERIFY]`
- **Your AI, your key.** Each organisation chooses its approved AI providers and can bring its own credentials; administrators can lock the choice for everyone.

Honesty line (keep it): AI suggests, people decide. Scanned image-only PDFs aren't read yet.

---

## 4. Hub — contacts and outreach next to the plan

**Headline:** Your outreach lives beside the plan that drove it.
Hub holds contacts, companies, pipeline stage and outreach, wired to the same organisation as North. Seek handles prospecting on the same contact base. Hub is not a replacement for your CRM — it's the relationship layer under the plan. Connect the tools you already use (HubSpot, Salesforce, Zoho, Dynamics, Marketo, Pipedrive, Google Ads and Analytics and more) with credentials each organisation manages itself. `[VERIFY: no provider sign-in tested yet — consider saying "connector framework" or "coming" until you've tested one]`
Branding: shown as part of North, per the recommendation in the brief. `[Stef: confirm]`

---

## 5. Pricing (placeholder)

**Headline:** Pricing that fits your team.
North is priced per organisation, with plans for different team sizes. Tell us about your team and we'll recommend a plan. → Talk to us
`[Stef: confirm "per organisation" — the product has per-org plan records and invoices; no public numbers added. Any tier names or prices must come from you.]`

---

## 6. About

**Headline:** Built from real planning pain.
North was built by a go-to-market marketer who spent years rebuilding funnel models in spreadsheets and decks. `[Stef: confirm which background details you're happy to publish — your profile mentions 10–15 years in GTM/field marketing in B2B SaaS and past roles at Anaplan and Workday; I have not put employer names on the page.]` Based in Sydney, Australia.

---

## 7. Help & support
Existing users: **Help & FAQ** opens inside North (the "?" button on every page), including questions on Hub. Contact: `[Stef: support email]`. Release notes: `[Stef: yes/no — none exist as a public page yet]`.

## 8. Sign in
Button → https://northm.vercel.app/ `[Stef: swap for the domain once bought]`.

## 9. Legal (shells — nothing here is legal advice)
Privacy Statement and Terms: first drafts exist (`2026-09-09-item37-privacy-statement-and-tcs-first-draft.md`); they stay `[CONFIRM]` until your seven Item 37 answers are in and a lawyer has seen both together. The short plain-English privacy summary can go live first. **Do not publish a "we don't track you" claim until you've confirmed what cookies/analytics North actually uses.**

---

## Claims check (what is true today, so you can trim)

| Claim on page | Evidence | Status |
|---|---|---|
| Nine linked modules incl. Reporting, shared data | Live UAT 9 Oct: every module opens, 0 errors | Confirmed live |
| Per-org isolation enforced in DB | Migration check 9 Oct: RLS bypass policies gone (v7 applied) | Confirmed live |
| Roles/permissions per org and person | Existing, long-running feature | Confirmed (by use) |
| Reporting drill-down graph | Drew a 49-node graph live | Confirmed live |
| Connector cards for 16 apps, org-managed credentials | Cards render live; no real sign-in tested | Built, partly verified |
| Fill from brief (Word/txt/PDF/voice) | Headless tests only | Built, not live-tested |
| Talk to this screen | Headless tests only | Built, not live-tested |
| Ask Alec review / read-aloud / drafts | Headless tests only; no org voice provider set up | Built, not live-tested |
| Board report PPT export | Built and pushed (per backlog) | Verify live |
| Bring-your-own AI key, admin lock | Config page documented in FAQ | Confirmed (docs) |
| Pricing per organisation | Plan/invoice tables exist | Needs your decision |

## What I need from you to finish the site
1. Pricing shape (per organisation? seats? tiers?) — even a placeholder you're happy with.
2. Where "Request a demo" goes, plus a support email.
3. Domain (and whether sign-in link moves to it) — also lets me set the connector redirect address once.
4. Item 37 answers (entity name/ABN/address, hosting region, LLM providers, cookies, retention, payment terms, governing law) so legal pages can be finalised and sent to a lawyer.
5. Which About details you're happy to publish.
6. Your go-ahead on format: I can turn this copy into a simple multi-page static site (HTML/CSS, North styling and logo from the brand files) for Vercel, or hand it to a designer as-is. I haven't built any HTML yet, to avoid guessing the design you want.
