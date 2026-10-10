# KPI spec — "Contribution to closed pipeline" (2026-10-10)

**Why:** North's promise is that marketing can prove value. This is the headline number. Nothing here is built yet; this document says what already exists, what's missing, and the smallest build that makes the number real. `[Stef: answers needed in section 5 before building]`

## 1. Definition (proposed)
For a chosen period (by deal **close date**) and scope (org / region / programme / campaign):

1. **Sourced closed-won value** = sum of value of deals with stage *Closed Won* that are linked to a campaign.
2. **Contribution %** = sourced closed-won value ÷ all closed-won value in the period. The remainder is shown as **Unattributed** — never hidden, never dropped.
3. **Return on spend** = sourced closed-won value ÷ actual spend of those campaigns (spend = the roll-up from budget line items).
4. **Open pipeline contribution** (leading indicator) = value of open deals (Prospecting → Negotiation) linked to campaigns, shown both raw and weighted by Scoring's win probability.

"Closed pipeline" is interpreted as **Closed Won**. Closed Lost is shown separately so the number isn't flattering.

**Rules that make it credible (goes on the page and in the report footer):** one fixed attribution rule per organisation (shown on screen); deal value and currency come from the deal record (converted at the report's stated rate); the list of deals behind the number is one click away; edits to deal-campaign links are logged; unattributed revenue is always displayed.

## 2. What already exists (confirmed in the code, 10 Oct 2026)
- Deals (`augur_deals`) store value, currency, stage, close date, source, and a **real campaign link** (`campaign_id`). Stages: Prospecting, Qualifying, Proposal, Negotiation, Closed Won, Closed Lost.
- Campaign Planning → **Effectiveness** already reads Closed Won deals linked to each campaign and shows cost per outcome and revenue contribution per campaign (with a click-through to the campaign).
- Strategy reads total pipeline and value by stage (used in the Board report); budgets and actual spend roll up from line items via one rule.
- Reporting's drill-down links campaigns ↔ deals ↔ partners.

## 3. Gaps (what stops it being a trustworthy headline today)
1. **No org-wide headline.** The per-campaign view exists; the sum, the % of all closed-won and the "unattributed" remainder do not.
2. **One campaign per deal.** Good for "sourced"; cannot show "influenced" or multi-touch. Partner shares exist at campaign level (lead share %), not deal level.
3. **Currency.** Deals carry their own currency; the headline needs one reporting currency and a stated rate (FX auto-rates are parked).
4. **Deal data is mostly hand-entered.** The CRM connectors have not been tested against a real account, so stage and close date can drift from the CRM — which is exactly what a sceptical CFO will check.
5. **No creation date / first-touch date on deals** (can't show sales-cycle length or lag between spend and revenue).
6. **No "unlinked closed-won" work list**, so marketing can't see which closed deals are missing a campaign and fix them.

## 4. Proposed build in stages (each shippable on its own)
- **Stage 1 — headline tile (small, mostly reuse):** compute 1–4 above from existing data; show on Board report, Reporting and Strategy home; drill to the deals list; show Unattributed and Closed Lost; add a period + currency selector; add to PowerPoint export as numbers only. Includes an "Unlinked closed-won deals" list with a link-to-campaign action. Tests: golden-compare scenarios including zero deals, mixed currencies, deals with no campaign, partial-period.
- **Stage 2 — sourced vs influenced:** a deal ↔ campaign link table with a role (sourced / influenced) and a weight, so one deal can credit several campaigns without double-counting the total. Rule is fixed per org and displayed.
- **Stage 3 — CRM-fed deals:** feed stage, value and close date from the CRM through a connector, so the numbers are finance-checkable. Depends on one connector being tested live.
- **Stage 4 — lag and velocity:** creation date and stage-entry dates, to show how long spend takes to turn into revenue.

## 5. Questions for you (blocking Stage 1 design)
1. "Closed pipeline" = **Closed Won** only? (my assumption)
2. Credit rule for v1: **sourced only** (one campaign per deal), with influenced coming in Stage 2? (my recommendation — simplest to defend)
3. Reporting currency: the org's base currency with a rate you set per period? (assumes manual rates)
4. Should partners' share be reported separately (partner-sourced vs own-marketing-sourced)?
5. OK to put the tile on the Board report by default (still controlled by the existing board-report access setting)?

## 6. Website implication
Until Stage 1 is built, describe it on the site as "what North is built to measure" and show it as a specification-level capability, not a live feature. The per-campaign Effectiveness view is real today and can be shown.
