# Item 37 — 7 quick answers, then this is ready for a lawyer

Full draft with all the context is the project doc `claude/2026-09-09-item37-privacy-statement-and-tcs-first-draft.md`. This
is just the answer list pulled out on its own so you can fire back short replies without opening that
whole doc. Reply with whatever you've got — partial answers are fine, the rest stays marked `[CONFIRM]`.

1. **Legal entity name, ABN/ACN, registered address** — used throughout both documents.
2. **Hosting region(s)** — which Supabase project region and Vercel deployment region are actually in
   use? Plus which LLM provider(s) are configured for AI features.
3. **Cookies/analytics** — does North use anything beyond a plain session/auth cookie? If no, that's a
   genuine "we don't track you" claim worth making plainly. If yes, it needs disclosure (and probably a
   cookie banner).
4. **Retention** — how long is account data kept after an org cancels, before deletion/anonymization?
   And separately: how long does a customer have to export their data after termination?
5. **Payment terms** — days to pay an invoice (14? 30?), and what happens on late payment (suspension?
   interest?). A commercial call, not a legal one.
6. **Does a plan need written agreement before it's binding**, or does using North count as accepting
   whatever plan is configured? Affects enforceability.
7. **Governing law** — assumed NSW, Australia (matches your Sydney base) unless you expect customers
   outside Australia and want to set it deliberately.

Once these are in, next step is sending both documents to a lawyer together (the T&Cs' data clauses
reference the Privacy Statement, so a reviewer will want them as a pair).
