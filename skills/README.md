# North skills folder

Backlog item 22 (AI screen interpreter, "Ask Alex"), phase 1. Each file here is a
plain, inspectable definition of one "explain this screen" skill -- not a black box,
matching the design principle already used for Augur's scoring model (item 13).

## Format

```json
{
  "id": "explain-strategy-dashboard",
  "module": "Ordo",
  "page": "dashboard",
  "title": "Ask Alex",
  "instructions": "...the system prompt sent to the org's chosen AI provider...",
  "context_fn": "pageContextForAI",
  "max_context_fields": ["module", "page", "fy", "scope", "kpis", "counts"]
}
```

- `module` / `page` — which North tool and page this skill applies to (matches the
  file's own `PAGES` entry `id`).
- `instructions` — the system prompt. Plain text, editable here without touching any
  JS. Written to only ever explain what's in the context object, never invent facts.
- `context_fn` — the name of the JS function (defined in that module's own HTML file,
  e.g. `Ordo.html`'s `pageContextForAI()`) that builds the summary object handed to
  the AI. Each module implements its own, matching the rest of this codebase's
  per-file architecture -- there's no shared context-building module.
- `max_context_fields` — the actual technical enforcement of "summary only, never raw
  records": the calling code only ever sends the whitelisted top-level keys from
  whatever `context_fn` returns, checked before the request goes out. `context_fn` can
  compute whatever's internally convenient; only these keys leave the browser.

## Why this exists

Per `claude/2026-09-04-ai-screen-interpreter-phase1-proposal.md`: "explain this
screen" is routed through Hub-Backend's existing `/admin/ai-generate` endpoint (the
same pipe Board report's AI narrative already uses) rather than a new integration --
this folder only supplies the prompt template and the field whitelist, both sent as
plain data. Gated per-org by `ai_screen_interpreter_enabled` in Configuration
(Norma.html -> Integrations), default off, since this sends a summary of live org
data to a third-party LLM provider.

## Adding a new skill

One more JSON file, one more `pageContextForAI()`-equivalent in that module's own
HTML file (name it to match, or point `context_fn` at whatever you called it), and a
new `id`/`module`/`page` entry. Phase 1 ships exactly one (Ordo's dashboard) --
everything else is deliberately not built yet.
