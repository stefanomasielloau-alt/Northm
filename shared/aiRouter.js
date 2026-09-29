/* shared/aiRouter.js (2026-09-29, Stef: "I want the ability for users to have a choice between the API, the
   desktop version, or the web version of an LLM or agent ... an org can mandate what LLM/Agents to use where --
   one or multiple -- or set a preferred one and a user could choose from a list of approved. Equally the user
   could connect their own if the org allows").

   ONE place that decides which AI answers, for every AI touchpoint in North, and runs it:
     window.NorthAI.run({ area, prompt, context, taskId })      -> Promise<{ text, option }>
     window.NorthAI.run({ area, kind:'extract', prompt, input })  -> Promise<{ fields, raw, option }>
   Areas: ask_alec | board_report | content | doc_extract | agents (see AREAS).

   Option ("how the AI is reached"), one of:
     api      -- an org-approved provider row called by Hub-Backend with the ORG's server key (or 'builtin':
                 Hub-Backend's own default, today Gemini)
     own      -- the same Hub call but with the USER's own key (saved encrypted in Hub, never in North)
     local    -- a model on the user's own computer (Ollama), called straight from this browser
     web      -- the provider's website: North copies the full prompt, opens the site (prefilled where the
                 site supports it), and the user pastes the answer back into North
     desktop  -- the same hand-off for a desktop app (copy -> paste into the app -> paste the answer back)
   Web/desktop can't be read automatically (those apps don't allow it), so the paste-back step is the honest
   way to bring the answer home -- callers still just `await NorthAI.run(...)` and get text back.

   Who decides (org_ai_policy + llm_providers.approved + user_ai_prefs):
     choice_mode 'mandate' -> everyone uses the area's default (or the org default)
     choice_mode 'choose'  -> each user picks from the area's allowed list (defaults to all approved options);
                              areas[area].locked=true pins just that area
     allow_own_keys        -> adds "My own <provider> key" options
     allow_builtin         -> offers North's built-in AI
   Everything is fail-soft: with no policy row / no migration, behaviour is the old single "Active" row. */
(function () {
  var AREAS = {
    ask_alec:     { label: 'Ask Alec', hint: 'Questions about the screen you are on (every module)', modes: ['api', 'own', 'local', 'web', 'desktop'] },
    board_report: { label: 'Board report write-up', hint: 'Strategy → Board report “what changed” narrative', modes: ['api', 'own', 'local', 'web', 'desktop'] },
    content:      { label: 'Campaign Ask Alec', hint: 'Ask Alec on a single campaign in Campaign Planning', modes: ['api', 'own', 'local', 'web', 'desktop'] },
    doc_extract:  { label: 'Document upload', hint: 'Filling a campaign or target filter from a pasted/uploaded brief', modes: ['api', 'own', 'local', 'web', 'desktop'] },
    agents:       { label: 'Agents & automations', hint: 'Runs on the server (flows, Agent Registry) — only API options can run unattended', modes: ['api'] }
  };
  /* What each provider kind can do. web: {q} is replaced with the URL-encoded prompt when the site accepts a
     prefilled prompt (checked live 2026-09-29 -- see PREFILL_NOTE); otherwise the prompt is only copied. */
  var KINDS = {
    'Anthropic':     { provider: 'anthropic', name: 'Claude', web: 'https://claude.ai/new?q={q}', desktop: 'Claude desktop app' },
    'OpenAI':        { provider: 'openai', name: 'ChatGPT', web: 'https://chatgpt.com/?q={q}', desktop: 'ChatGPT desktop app' },
    'Google Gemini': { provider: 'gemini', name: 'Gemini', web: 'https://gemini.google.com/app', desktop: 'Gemini' },
    'Perplexity':    { provider: 'perplexity', name: 'Perplexity', web: 'https://www.perplexity.ai/search?q={q}', desktop: 'Perplexity app' },
    'DeepSeek':      { provider: 'deepseek', name: 'DeepSeek', web: 'https://chat.deepseek.com/', desktop: 'DeepSeek app' },
    'Ollama':        { provider: null, name: 'Ollama', local: 'http://localhost:11434', desktop: 'Ollama' },
    'Azure OpenAI':  { provider: null, name: 'Azure OpenAI' },
    'Other':         { provider: null, name: 'Other' }
  };
  var OWN_PROVIDERS = [['anthropic', 'Anthropic (Claude)'], ['openai', 'OpenAI (ChatGPT)'], ['gemini', 'Google Gemini'], ['perplexity', 'Perplexity'], ['deepseek', 'DeepSeek']];
  var MODE_LABEL = { api: 'API', own: 'your own key', local: 'on this computer', web: 'web app', desktop: 'desktop app' };
  var MAX_PREFILL = 3500; // characters of prompt we'll put in a URL; longer prompts are copied only
  var EXTRACT_PROMPT = 'You extract structured facts from a marketing campaign brief. Read the text and return ONLY a JSON object (no markdown, no commentary) with whichever of these keys you can confidently fill in from the text -- omit any key you can\'t find evidence for, never guess a value: name (campaign name), objective, audience, keyMessages (array of strings), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), budget (a number, no currency symbol), channels (array of strings). This is a first draft a human will review and correct -- accuracy matters more than completeness.';

  var st = { key: '', loading: null, providers: [], policy: null, prefs: {}, ownKeys: {}, policyTable: true, prefsTable: true };

  function g(name) { try { return (0, eval)('typeof ' + name + '!=="undefined"?' + name + ':undefined'); } catch (e) { return undefined; } }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function orgId() { var sav = g('_savOrgFilter'); return (sav !== undefined && sav !== null) ? sav : g('_orgId'); }
  function hubSlug() { return g('_hubOrgSlug') || ''; }
  function hubUrl() { return g('CONTACT_URL') || 'https://hub-backend-psi.vercel.app'; }
  function toastMsg(m) { var t = g('toast'); if (typeof t === 'function') t(m); }
  async function session() {
    var sb = g('sb'); var s = await sb.auth.getSession();
    var ses = s && s.data && s.data.session;
    if (!ses) throw new Error('Your North session has expired -- sign in again.');
    return ses;
  }

  /* ---------- load (cached per org + user; call NorthAI.reload() after an admin edit) ---------- */
  async function load(force) {
    var sb = g('sb'), org = orgId();
    if (!sb || !org) return st;
    var ses = null; try { ses = await session(); } catch (e) { return st; }
    var key = org + '|' + ses.user.id;
    if (!force && st.key === key) return st;
    if (!force && st.loading) return st.loading;
    st.loading = (async function () {
      var pr = await sb.from('llm_providers').select('*').eq('org_id', org);
      st.providers = (pr && !pr.error && pr.data) || [];
      var po = await sb.from('org_ai_policy').select('*').eq('org_id', org).maybeSingle();
      st.policyTable = !(po && po.error);
      st.policy = (po && !po.error && po.data) || null;
      var up = await sb.from('user_ai_prefs').select('choices').eq('user_id', ses.user.id).eq('org_id', org).maybeSingle();
      st.prefsTable = !(up && up.error);
      st.prefs = (up && !up.error && up.data && up.data.choices) || {};
      st.ownKeys = {};
      if (policy().allow_own_keys) { try { st.ownKeys = await ownKeyStatus(); } catch (e) { st.ownKeys = {}; } }
      st.key = key; st.loading = null;
      return st;
    })();
    return st.loading;
  }
  function policy() {
    var p = st.policy || {};
    return { choice_mode: p.choice_mode || 'choose', allow_own_keys: !!p.allow_own_keys, allow_builtin: p.allow_builtin !== false, areas: p.areas || {} };
  }

  /* ---------- options for an area ---------- */
  function rowMode(p) { var m = p.access_type || 'api'; if ((p.kind === 'Ollama') && m === 'api') m = 'local'; return m; }
  function rowOption(p) {
    var k = KINDS[p.kind] || {}, mode = rowMode(p);
    var o = { id: String(p.id), rowId: p.id, label: p.name || (k.name || p.kind), kind: p.kind, mode: mode, provider: k.provider || null,
      model: p.model || '', name: k.name || p.name, orgDefault: !!p.enabled, approved: p.approved !== false };
    if (mode === 'web') o.url = (p.web_url || '').trim() || k.web || (p.endpoint || '').trim();
    if (mode === 'local') o.endpoint = (p.endpoint || '').trim() || k.local || 'http://localhost:11434';
    if (mode === 'desktop') o.app = k.desktop || p.name;
    o.usable = mode === 'api' ? !!o.provider : mode === 'web' ? !!o.url : mode === 'local' ? !!o.model : true;
    o.why = o.usable ? '' : (mode === 'api' ? 'North can’t call ' + p.kind + ' by API yet' : mode === 'web' ? 'no web address set' : 'set a model name (e.g. llama3.1)');
    return o;
  }
  function allOrgOptions() {
    var out = [];
    if (policy().allow_builtin) out.push({ id: 'builtin', label: 'North built-in AI', mode: 'api', provider: null, name: 'North built-in AI', usable: true, builtin: true });
    st.providers.forEach(function (p) { if (p.approved !== false) out.push(rowOption(p)); });
    return out;
  }
  function ownOptions() {
    if (!policy().allow_own_keys) return [];
    return OWN_PROVIDERS.map(function (x) {
      var k = st.ownKeys[x[0]] || {};
      return { id: 'own:' + x[0], label: 'My own ' + x[1] + ' key', mode: 'own', provider: x[0], name: x[1], model: k.model || '', usable: !!k.set, why: k.set ? '' : 'add your key first', own: true };
    });
  }
  function options(area) {
    var A = AREAS[area] || AREAS.ask_alec, cfg = policy().areas[area] || {};
    var org = allOrgOptions().filter(function (o) { return A.modes.indexOf(o.mode) >= 0; });
    if (Array.isArray(cfg.allowed) && cfg.allowed.length) org = org.filter(function (o) { return cfg.allowed.indexOf(o.id) >= 0; });
    var own = A.modes.indexOf('own') >= 0 ? ownOptions() : [];
    return org.concat(own);
  }
  function resolve(area) {
    var P = policy(), cfg = P.areas[area] || {}, opts = options(area);
    var usable = opts.filter(function (o) { return o.usable; });
    var find = function (id) { return id ? usable.filter(function (o) { return o.id === String(id); })[0] : null; };
    var def = find(cfg.default) || usable.filter(function (o) { return o.orgDefault; })[0] || find('builtin') || usable[0] || null;
    var locked = P.choice_mode === 'mandate' || !!cfg.locked;
    if (locked) return { option: def, locked: true, options: def ? [def] : [], all: opts, def: def };
    return { option: find(st.prefs[area]) || def, locked: false, options: opts, all: opts, def: def };
  }
  async function setChoice(area, optionId) {
    var sb = g('sb'), org = orgId(), ses = await session();
    st.prefs = Object.assign({}, st.prefs); if (optionId) st.prefs[area] = optionId; else delete st.prefs[area];
    if (!st.prefsTable) { toastMsg('Your choice applies until you reload — the AI choice tables aren’t installed yet.'); return; }
    var r = await sb.from('user_ai_prefs').upsert({ user_id: ses.user.id, org_id: org, choices: st.prefs, updated_at: new Date().toISOString() });
    if (r && r.error) toastMsg('Could not save your AI choice: ' + r.error.message);
  }

  /* ---------- own keys (Hub-Backend; the key never comes back) ---------- */
  async function ownKeyStatus() {
    var ses = await session();
    var r = await fetch(hubUrl() + '/ai/own-key/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ses.access_token, org: hubSlug() }) });
    var j = await r.json().catch(function () { return {}; });
    return (j && j.keys) || {};
  }
  async function saveOwnKey(provider, key, model, remove) {
    var ses = await session();
    var r = await fetch(hubUrl() + '/ai/own-key', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ses.access_token, org: hubSlug(), provider: provider, key: key || '', model: model || '', remove: !!remove }) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.ok) throw new Error((j && j.error) || ('Could not save (' + r.status + ')'));
    st.ownKeys = await ownKeyStatus().catch(function () { return st.ownKeys; });
    return j;
  }

  /* ---------- running an option ---------- */
  async function registryProvider(taskId, token) {
    if (!taskId) return {};
    try {
      var r = await fetch(hubUrl() + '/registry/task-provider?task_id=' + encodeURIComponent(taskId) + '&token=' + encodeURIComponent(token) + '&org=' + encodeURIComponent(hubSlug()));
      var j = r.ok ? await r.json().catch(function () { return {}; }) : {};
      return (j && j.ai_provider) ? { provider: j.ai_provider, model: j.ai_model || undefined } : {};
    } catch (e) { return {}; }
  }
  function hubErr(resp, j) {
    var er = j && j.error, msg = typeof er === 'string' ? er : (er ? JSON.stringify(er) : ('AI request failed (' + resp.status + ')'));
    var e = new Error(msg); if (resp.status === 501) e.notConfigured = true; return e;
  }
  async function viaHub(o, a) {
    var ses = await session(), body = { token: ses.access_token };
    var pm = { provider: o.provider || undefined, model: o.model || undefined };
    if (o.builtin) pm = await registryProvider(a.taskId, ses.access_token);   // an Agent Registry pin still applies to the built-in route
    body.provider = pm.provider; body.model = pm.model;
    if (o.mode === 'own') { body.use_own_key = true; body.org = hubSlug(); }
    var url = hubUrl() + (a.kind === 'extract' ? '/admin/ai-extract' : '/admin/ai-generate');
    if (a.kind === 'extract') { body.input_text = a.input; if (a.prompt) body.prompt = a.prompt; }
    else { body.prompt = a.prompt; body.context = a.context || ''; }
    var resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var j = await resp.json().catch(function () { return {}; });
    if (!resp.ok || !j.ok) throw hubErr(resp, j);
    if (a.kind === 'extract') return { fields: j.fields || null, raw: j.raw || '' };
    var text = String(j.raw || '').trim(); if (!text) throw new Error('The AI returned nothing usable.');
    return { text: text };
  }
  async function viaLocal(o, a) {
    var sys = a.kind === 'extract' ? (a.prompt || EXTRACT_PROMPT) : a.prompt, user = a.kind === 'extract' ? a.input : (a.context || '(no additional context)');
    var resp;
    try {
      resp = await fetch(o.endpoint.replace(/\/+$/, '') + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: o.model, stream: false, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }) });
    } catch (e) {
      throw new Error('Couldn’t reach ' + (o.name || 'your local model') + ' at ' + o.endpoint + '. Start Ollama, and allow North to talk to it: set the environment variable OLLAMA_ORIGINS=' + location.origin + ' then restart Ollama.');
    }
    var j = await resp.json().catch(function () { return {}; });
    if (!resp.ok) throw new Error((j && j.error) || ('Local model error (' + resp.status + ')'));
    var text = String((j.message && j.message.content) || j.response || '').trim();
    if (!text) throw new Error('The local model returned nothing usable.');
    return a.kind === 'extract' ? { fields: parseJsonLoose(text), raw: text } : { text: text };
  }
  function parseJsonLoose(t) {
    var s = String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    var i = s.indexOf('{'), k = s.lastIndexOf('}');
    if (i < 0 || k < i) return null;
    try { return JSON.parse(s.slice(i, k + 1)); } catch (e) { return null; }
  }
  function fullPrompt(a) {
    if (a.kind === 'extract') return (a.prompt || EXTRACT_PROMPT) + '\n\n--- DOCUMENT ---\n' + a.input;
    return a.prompt + (a.context ? '\n\n--- CONTEXT (from North) ---\n' + a.context : '');
  }
  async function run(a) {
    a = a || {}; var area = a.area || 'ask_alec';
    await load();
    var r = resolve(area), o = a.optionId ? (options(area).filter(function (x) { return x.id === a.optionId && x.usable; })[0] || r.option) : r.option;
    if (!o) { var e = new Error('No AI option is available for ' + ((AREAS[area] || {}).label || area) + ' — an admin can set one up in Configuration → AI & agents.'); e.notConfigured = true; throw e; }
    var out;
    if (o.mode === 'api' || o.mode === 'own') out = await viaHub(o, a);
    else if (o.mode === 'local') out = await viaLocal(o, a);
    else {
      var text = await handoff(o, fullPrompt(a), area, a.kind === 'extract');
      out = a.kind === 'extract' ? { fields: parseJsonLoose(text), raw: text } : { text: text };
    }
    out.option = o; return out;
  }

  /* ---------- modal plumbing ---------- */
  var CSS = '.nai-ov{position:fixed;inset:0;background:rgba(16,24,43,.45);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}' +
    '.nai-box{background:var(--surface,#fff);color:var(--ink,#10182B);border-radius:12px;max-width:620px;width:100%;box-shadow:0 20px 50px rgba(16,24,43,.25);padding:20px 22px;font-size:13.5px;line-height:1.45}' +
    '.nai-box h3{margin:0 0 6px;font-size:16px}.nai-box .mini{font-size:12px;color:var(--ink-3,#6B7489)}' +
    '.nai-step{border:1px solid var(--line,#DFE3EB);border-radius:10px;padding:12px;margin-top:12px}.nai-step b.n{display:inline-block;width:20px;height:20px;border-radius:50%;background:var(--nav,#1F3A68);color:#fff;text-align:center;font-size:11px;line-height:20px;margin-right:6px}' +
    '.nai-box textarea{width:100%;box-sizing:border-box;border:1px solid var(--line,#DFE3EB);border-radius:8px;padding:8px;font:inherit;font-size:12.5px}' +
    '.nai-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.nai-row .sp{flex:1}' +
    '.nai-btn{border:1px solid var(--line,#DFE3EB);background:#fff;border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer}.nai-btn.pri{background:var(--nav,#1F3A68);border-color:var(--nav,#1F3A68);color:#fff}.nai-btn:disabled{opacity:.55;cursor:default}' +
    '.nai-area{display:grid;grid-template-columns:1fr 240px;gap:4px 12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line,#EEF0F5)}.nai-area select,.nai-key input{width:100%;box-sizing:border-box;border:1px solid var(--line,#DFE3EB);border-radius:6px;padding:6px 8px;font:inherit;font-size:12.5px}' +
    '.nai-key{display:grid;grid-template-columns:150px 1fr 150px auto;gap:6px;align-items:center;padding:6px 0}.nai-pill{display:inline-block;font-size:11px;border-radius:10px;padding:1px 8px;background:#E7F5EE;color:#0E7A52}.nai-lock{font-size:12px;color:var(--ink-2,#45506B)}';
  function ensureCss() { if (document.getElementById('nai-css')) return; var s = document.createElement('style'); s.id = 'nai-css'; s.textContent = CSS; document.head.appendChild(s); }
  function modal(html) {
    ensureCss(); closeModal();
    var ov = document.createElement('div'); ov.className = 'nai-ov'; ov.id = 'naiModal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="nai-box">' + html + '</div>'; document.body.appendChild(ov); return ov;
  }
  function closeModal() { var m = document.getElementById('naiModal'); if (m) m.remove(); }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      try { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e2) { return false; }
    }
  }

  /* ---------- web / desktop hand-off: copy -> open -> paste the answer back ---------- */
  function handoff(o, prompt, area, wantJson) {
    return new Promise(function (resolve, reject) {
      var isWeb = o.mode === 'web', name = o.name || o.label;
      var canPrefill = isWeb && /\{q\}/.test(o.url || '') && prompt.length <= MAX_PREFILL;
      var openUrl = isWeb ? (canPrefill ? o.url.replace('{q}', encodeURIComponent(prompt)) : (o.url || '').replace(/[?&][^?&]*\{q\}.*/, '')) : '';
      var h = '<h3>Ask ' + esc(name) + ' (' + (isWeb ? 'web app' : 'desktop app') + ')</h3>' +
        '<div class="mini">You chose to use ' + esc(name) + ' through its ' + (isWeb ? 'website' : 'desktop app') + ' for ' + esc((AREAS[area] || {}).label || 'this') +
        '. North can’t read answers from other apps by itself, so it hands the question over and you bring the answer back — two quick steps.</div>' +
        '<div class="nai-step"><b class="n">1</b><b>' + (isWeb ? (canPrefill ? 'Open ' + esc(name) + ' with the question filled in' : 'Copy the question and open ' + esc(name)) : 'Copy the question') + '</b>' +
        '<div class="mini" style="margin-top:4px">' + (isWeb ? (canPrefill ? 'It’s also copied, in case the site doesn’t pick it up.' : 'Then paste it into the chat box (Ctrl+V / Cmd+V) and send.') :
          'Then open the ' + esc(o.app || name) + ', paste it into a new chat (Ctrl+V / Cmd+V) and send.') + (wantJson ? ' Ask for the JSON only.' : '') + '</div>' +
        '<div class="nai-row"><button class="nai-btn pri" id="naiGo" type="button">' + (isWeb ? (canPrefill ? 'Open ' + esc(name) : 'Copy & open ' + esc(name)) : 'Copy question') + '</button><span class="mini" id="naiGoMsg"></span></div>' +
        '<details style="margin-top:8px"><summary class="mini">See exactly what will be shared (' + prompt.length.toLocaleString() + ' characters)</summary><textarea readonly rows="7" style="margin-top:6px">' + esc(prompt) + '</textarea></details></div>' +
        '<div class="nai-step"><b class="n">2</b><b>Paste ' + esc(name) + '’s answer here</b>' +
        '<textarea id="naiAnswer" rows="8" style="margin-top:8px" placeholder="Paste the answer…"></textarea></div>' +
        '<div class="nai-row"><span class="mini">Change how Alec answers in <a href="#" id="naiSet">AI settings</a>.</span><span class="sp"></span>' +
        '<button class="nai-btn" id="naiCancel" type="button">Cancel</button><button class="nai-btn pri" id="naiUse" type="button">Use this answer</button></div>';
      var ov = modal(h);
      var done = false, finish = function (ok, val) { if (done) return; done = true; closeModal(); if (ok) resolve(val); else { var e = new Error('You cancelled the hand-off.'); e.cancelled = true; reject(e); } };
      ov.querySelector('#naiGo').onclick = async function () {
        var copied = await copyText(prompt);
        if (isWeb && openUrl) window.open(openUrl, '_blank', 'noopener');
        ov.querySelector('#naiGoMsg').textContent = copied ? 'Copied ✓' + (isWeb ? ' — ' + name + ' opened in a new tab.' : ' — now paste it into the app.') : 'Couldn’t copy automatically — open “See exactly what will be shared”, select all and copy.';
        setTimeout(function () { var t = ov.querySelector('#naiAnswer'); if (t) t.focus(); }, 50);
      };
      ov.querySelector('#naiCancel').onclick = function () { finish(false); };
      ov.querySelector('#naiSet').onclick = function (ev) { ev.preventDefault(); finish(false); openSettings(area); };
      ov.querySelector('#naiUse').onclick = function () {
        var v = (ov.querySelector('#naiAnswer').value || '').trim();
        if (!v) { ov.querySelector('#naiAnswer').focus(); return; }
        finish(true, v);
      };
      ov.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') finish(false); });
    });
  }

  /* ---------- the user's own AI settings ---------- */
  function optLabel(o) { return o.label + (o.mode === 'api' || o.own ? '' : ' · ' + MODE_LABEL[o.mode]) + (o.usable ? '' : ' — ' + o.why); }
  async function openSettings(focusArea) {
    await load();
    var P = policy();
    var h = '<h3>How Alec answers</h3><div class="mini">Pick which AI you use for each part of North. ' +
      (P.choice_mode === 'mandate' ? 'Your organisation has set these for everyone.' : 'Your organisation decides which options are on the list.') +
      ' <b>API</b> and <b>your own key</b> answer right here; <b>web</b> and <b>desktop</b> apps open the app and you paste the answer back.</div>';
    Object.keys(AREAS).forEach(function (area) {
      if (area === 'agents') return;
      var r = resolve(area), A = AREAS[area];
      h += '<div class="nai-area"' + (area === focusArea ? ' style="background:rgba(31,58,104,.05)"' : '') + '><div><b>' + esc(A.label) + '</b><div class="mini">' + esc(A.hint) + '</div></div><div>';
      if (r.locked) h += '<div class="nai-lock">🔒 ' + esc(r.option ? optLabel(r.option) : 'Not set up yet') + '<div class="mini">Set by your organisation</div></div>';
      else if (!r.options.length) h += '<div class="nai-lock">No options yet<div class="mini">An admin can add them in Configuration → AI &amp; agents</div></div>';
      else h += '<select data-area="' + area + '">' + r.options.map(function (o) {
        return '<option value="' + esc(o.id) + '"' + (r.option && r.option.id === o.id ? ' selected' : '') + (o.usable ? '' : ' disabled') + '>' + esc(optLabel(o)) + (r.def && r.def.id === o.id ? ' (org default)' : '') + '</option>';
      }).join('') + '</select>';
      h += '</div></div>';
    });
    if (P.allow_own_keys) {
      h += '<h3 style="margin-top:16px">Your own AI keys</h3><div class="mini">Stored encrypted in Hub, only for you — North and your admins never see them. Model = the exact model name from the provider (for example the one shown in their API docs).</div>';
      OWN_PROVIDERS.forEach(function (x) {
        var k = st.ownKeys[x[0]] || {};
        h += '<div class="nai-key" data-prov="' + x[0] + '"><div><b>' + esc(x[1]) + '</b>' + (k.set ? '<div><span class="nai-pill">saved ' + esc(k.hint || '') + '</span></div>' : '') + '</div>' +
          '<input type="password" autocomplete="off" placeholder="' + (k.set ? 'Replace key (optional)' : 'Paste API key') + '" data-f="key">' +
          '<input type="text" placeholder="Model name" value="' + esc(k.model || '') + '" data-f="model">' +
          '<div style="white-space:nowrap"><button class="nai-btn" type="button" data-act="save">Save</button>' + (k.set ? ' <button class="nai-btn" type="button" data-act="remove">Remove</button>' : '') + '</div></div>';
      });
    }
    h += '<div class="mini" style="margin-top:12px">Using a model on your own computer (Ollama)? An admin adds it as a “Local model” option. On your computer set <code>OLLAMA_ORIGINS=' + esc(location.origin) + '</code> and restart Ollama so North can reach it.</div>';
    h += '<div class="nai-row"><span class="sp"></span><button class="nai-btn pri" type="button" id="naiClose">Done</button></div>';
    var ov = modal(h);
    ov.querySelector('#naiClose').onclick = closeModal;
    ov.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeModal(); });
    ov.querySelectorAll('select[data-area]').forEach(function (s) {
      s.onchange = async function () { await setChoice(s.getAttribute('data-area'), s.value); notify(); toastMsg('Saved — ' + AREAS[s.getAttribute('data-area')].label + ' now uses ' + s.options[s.selectedIndex].text + '.'); };
    });
    ov.querySelectorAll('.nai-key button').forEach(function (b) {
      b.onclick = async function () {
        var row = b.closest('.nai-key'), prov = row.getAttribute('data-prov');
        var key = row.querySelector('[data-f=key]').value, model = row.querySelector('[data-f=model]').value;
        b.disabled = true;
        try {
          if (b.getAttribute('data-act') === 'remove') { await saveOwnKey(prov, '', '', true); toastMsg('Removed your ' + prov + ' key.'); }
          else { await saveOwnKey(prov, key, model, false); toastMsg('Saved your ' + prov + ' key.'); }
          notify(); openSettings(focusArea);
        } catch (e) { b.disabled = false; toastMsg(String(e.message || e)); }
      };
    });
  }

  /* ---------- small "Using: X" chip other UIs can render ---------- */
  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  function describe(area) {
    var r = resolve(area), o = r.option;
    return { text: o ? (o.label + (o.mode === 'api' || o.own ? '' : ' · ' + MODE_LABEL[o.mode])) : 'Not set up', locked: r.locked, option: o, count: r.options.filter(function (x) { return x.usable; }).length };
  }

  window.NorthAI = {
    AREAS: AREAS, KINDS: KINDS, OWN_PROVIDERS: OWN_PROVIDERS, MODE_LABEL: MODE_LABEL,
    load: load, reload: function () { st.key = ''; return load(true).then(function (x) { notify(); return x; }); },
    policy: policy, options: options, allOrgOptions: allOrgOptions, resolve: resolve, describe: describe, setChoice: setChoice,
    run: run, openSettings: openSettings, onChange: onChange, saveOwnKey: saveOwnKey, ownKeyStatus: ownKeyStatus,
    _parseJsonLoose: parseJsonLoose, _state: st, _handoff: handoff
  };
})();
