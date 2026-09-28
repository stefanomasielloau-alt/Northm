/* shared/askAlec.js (2026-09-29, Stef: "Make it Ask Alec ... ADD it to all Dashboard / report /
   planning / effectiveness pages in all modules").

   The right-hand, pinnable "Ask Alec" panel, first built inside Strategy (Ordo.html, 2026-09-28)
   and moved here so every module shares one implementation. It is a superset of the original
   one-shot Ask Alec button:
     - "Explain this dashboard" runs EXACTLY the original request (the skill file's Alec
       instructions, only the skill's whitelisted summary fields, the same Agent Registry task id);
     - free-form chat: page name + the module's structured summary (if any) + a compact text
       snapshot of what's visible on screen (never password fields; ~6000 chars) + last 6 turns.
   Same pipe as before: Hub-Backend /admin/ai-generate with the caller's own North JWT, provider/
   model from the task's Agent Registry entry, else the org's active LLM provider. Gated on the
   org-wide Ask Alec switch (Configuration -> Integrations, org_settings.ai_screen_interpreter_enabled).
   The panel lives on <body>, outside #main, so a module's render() never wipes the conversation.

   Usage (in a module, after its globals exist):
     NorthAskAlec.init({ moduleLabel:'Events', lsKey:'eventus', taskId:'reg_events_assistant_task',
       pages:['home','rollups'],            // page ids the button/panel is available on (null = all)
       pageInfo:()=>({id:UI.page,label:'...'}), starters:{home:'...'}, summary:()=>'...'|null,
       explain:{pages:['dashboard'],label:'Explain this dashboard',skillUrl:'skills/x.json',contextFn:()=>({...}),taskId:'...'},
       isEnabled:()=>bool });               // optional; default reads org_settings once
     ...and call NorthAskAlec.sync() at the end of render(). */
(function () {
  var CSS = ":root{--asst-w:380px;--asst-top:56px}\n.asst{position:fixed;top:var(--asst-top);right:0;width:var(--asst-w);max-width:100vw;height:calc(100vh - var(--asst-top));\n  background:var(--surface);border-left:1px solid var(--line);box-shadow:-6px 0 24px rgba(16,24,43,.12);z-index:60;\n  display:flex;flex-direction:column;transform:translateX(105%);transition:transform .24s cubic-bezier(.4,0,.2,1);visibility:hidden}\n.asst.open{transform:none;visibility:visible}\nbody.asst-pinned .asst{box-shadow:none}\nbody.asst-pinned .wrap,body.asst-pinned .ctxbar{margin-right:var(--asst-w)}\nbody.asst-open #fbTrigger{right:min(calc(var(--asst-w) + 20px), calc(100vw - 68px)) !important}\n.asst-hd{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--line);flex:0 0 auto}\n.asst-hd b{font-size:13.5px;color:var(--ink)}\n.asst-hd .pg{font-size:11px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}\n.asst-hd .sp{flex:1}\n.asst-ib{border:1px solid var(--line);background:#fff;border-radius:var(--r-sm);width:28px;height:26px;display:inline-flex;align-items:center;justify-content:center;color:var(--ink-2);font-size:13px;padding:0}\n.asst-ib:hover{background:var(--canvas);color:var(--ink)}\n.asst-ib[aria-pressed=\"true\"]{background:var(--nav);border-color:var(--nav);color:#fff}\n.asst-log{flex:1 1 auto;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:9px;background:var(--canvas)}\n.asst-msg{max-width:88%;padding:8px 11px;border-radius:10px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}\n.asst-msg.u{align-self:flex-end;background:var(--nav);color:#fff;border-bottom-right-radius:3px}\n.asst-msg.a{align-self:flex-start;background:#fff;border:1px solid var(--line);color:var(--ink);border-bottom-left-radius:3px}\n.asst-msg.w{align-self:stretch;max-width:none;background:var(--warn-bg);border-left:3px solid var(--warn);color:var(--ink-2);border-radius:var(--r-sm)}\n.asst-msg.e{align-self:stretch;max-width:none;background:var(--bad-bg);border-left:3px solid var(--bad);color:var(--ink-2);border-radius:var(--r-sm)}\n.asst-msg.typing{color:var(--ink-3);font-style:italic}\n.asst-intro{font-size:12px;color:var(--ink-2);line-height:1.5}\n.asst-sugg{display:flex;flex-direction:column;gap:6px;margin-top:8px}\n.asst-sugg button{text-align:left;border:1px solid var(--line);background:#fff;border-radius:16px;padding:6px 11px;font-size:12px;color:var(--ink-2)}\n.asst-sugg button:hover{border-color:var(--nav);color:var(--nav)}\n.asst-ft{flex:0 0 auto;border-top:1px solid var(--line);padding:9px 10px;background:var(--surface)}\n.asst-ft textarea{width:100%;resize:none;min-height:40px;max-height:140px;border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 9px;font:inherit;font-size:12.5px;box-sizing:border-box}\n.asst-ft textarea:disabled{background:var(--canvas)}\n.asst-ft .row2{display:flex;align-items:center;gap:8px;margin-top:6px}\n.asst-ft .hint{font-size:10.5px;color:var(--ink-3);flex:1}\n#tnAsstBtn[aria-expanded=\"true\"]{background:var(--nav);border-color:var(--nav);color:#fff}\n@media(max-width:860px){body.asst-pinned .wrap,body.asst-pinned .ctxbar{margin-right:0}}\n@media print{.asst{display:none !important}body.asst-pinned .wrap,body.asst-pinned .ctxbar{margin-right:0 !important}}\n.asst-explain{display:block;width:100%;margin-top:10px;text-align:left;border:1px solid var(--nav);background:#fff;color:var(--nav);border-radius:var(--r-sm);padding:8px 11px;font-size:12.5px;font-weight:600;cursor:pointer}\n.asst-explain:hover{background:var(--nav);color:#fff}\n.asst-explain:disabled{opacity:.5;cursor:default}";
  var C = null;
  var S = { open: false, pinned: false, msgs: [], busy: false, built: false, lastQ: '', lastKind: '', enabledFlag: null, loadingFlag: false };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  /* module globals are top-level let/const in each module's classic script -- visible to this
     script by bare name at call time, but not as window properties, hence the guarded lookup */
  function g(name) { try { return (0, eval)('typeof ' + name + '!=="undefined"?' + name + ':undefined'); } catch (e) { return undefined; } }

  function enabled() {
    if (C && typeof C.isEnabled === 'function') { try { return !!C.isEnabled(); } catch (e) { return false; } }
    if (S.enabledFlag === null && !S.loadingFlag) loadFlag();
    return !!S.enabledFlag;
  }
  function orgId() { var sav = g('_savOrgFilter'); return (sav !== undefined && sav !== null) ? sav : g('_orgId'); }
  function loadFlag() {
    var sb = g('sb'), oid = orgId(); if (!sb || !oid) return;
    S.loadingFlag = true;
    sb.from('org_settings').select('ai_screen_interpreter_enabled').eq('org_id', oid).maybeSingle().then(function (r) {
      S.enabledFlag = !!(r && !r.error && r.data && r.data.ai_screen_interpreter_enabled);
      S.loadingFlag = false; renderLog();
    }, function () { S.enabledFlag = false; S.loadingFlag = false; renderLog(); });
  }

  function available() {
    if (!C) return false;
    if (!C.pages) return true;
    return C.pages.indexOf(pageInfo().id) >= 0;
  }
  function pageInfo() { try { return C.pageInfo(); } catch (e) { return { id: '', label: '' }; } }
  function starters() {
    var base = ['What stands out on this page?', 'Where are the biggest gaps?', 'What should I do next?'];
    var x = C.starters && C.starters[pageInfo().id];
    return x ? base.concat([x]) : base;
  }
  function explainCfg() { var e = C && C.explain; if (!e) return null; return (!e.pages || e.pages.indexOf(pageInfo().id) >= 0) ? e : null; }

  /* Compact, visible-only text snapshot of #main. Password fields are never read. */
  function snapshot(limit) {
    limit = limit || 6000;
    var main = document.getElementById('main'); if (!main) return '';
    var lines = [], total = 0;
    var clean = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); };
    var push = function (t) { t = clean(t); if (!t) return; if (t.length > 300) t = t.slice(0, 297) + '...'; if (lines[lines.length - 1] === t) return; lines.push(t); total += t.length + 1; };
    var visible = function (el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); };
    var els = main.querySelectorAll('h1,h2,h3,h4,h5,.kpi,table,.note,.pill,p,label,input,select,textarea');
    for (var i = 0; i < els.length && total < limit; i++) {
      var el = els[i]; if (!visible(el)) continue;
      var tag = el.tagName;
      if (tag !== 'TABLE' && el.closest('table')) continue;
      if (!el.classList.contains('kpi') && el.closest('.kpi')) continue;
      if (/^H[1-5]$/.test(tag)) { push('## ' + el.textContent); continue; }
      if (el.classList.contains('kpi')) {
        var k = el.querySelector('.k'), v = el.querySelector('.kpi-v'), sub = el.querySelector('.sub');
        push('KPI: ' + (k ? clean(k.textContent) : '') + ' = ' + (v ? clean(v.textContent) : clean(el.textContent)) + (sub ? ' (' + clean(sub.textContent) + ')' : ''));
        continue;
      }
      if (tag === 'TABLE') {
        var cellTxt = function (c) { var f = c.querySelector('input:not([type=password]):not([type=hidden]),select'); return clean(f ? (f.tagName === 'SELECT' ? ((f.options[f.selectedIndex] || {}).text) : (f.type === 'checkbox' ? (f.checked ? 'yes' : 'no') : f.value)) : c.textContent); };
        var hr = el.tHead ? Array.prototype.filter.call(el.tHead.rows, function (r) { return !r.classList.contains('tt-filter'); }).pop() : null;
        var heads = hr ? Array.prototype.map.call(hr.cells, cellTxt) : [];
        var rows = Array.prototype.filter.call(el.tBodies[0] ? el.tBodies[0].rows : el.rows, function (r) { return r.style.display !== 'none'; });
        if (!heads.length && rows.length) { heads = Array.prototype.map.call(rows[0].cells, cellTxt); rows = rows.slice(1); }
        push('TABLE: ' + heads.join(' | '));
        rows.slice(0, 15).forEach(function (r) { if (total < limit) push('  ' + Array.prototype.map.call(r.cells, cellTxt).join(' | ')); });
        if (rows.length > 15) push('  ...(' + (rows.length - 15) + ' more rows not shown)');
        continue;
      }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (tag === 'INPUT' && /^(password|hidden|file|button|submit)$/i.test(el.type)) continue;
        if (el.closest('tr.tt-filter')) continue;
        var lab = el.getAttribute('aria-label') || el.title || el.placeholder || (el.labels && el.labels[0] ? el.labels[0].textContent : '') || el.name || '';
        var val = tag === 'SELECT' ? ((el.options[el.selectedIndex] || {}).text || '') : (el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? 'on' : 'off') : el.value);
        if (clean(val)) push('Field ' + clean(lab || '(unlabelled)') + ': ' + val);
        continue;
      }
      if (tag === 'LABEL' && el.querySelector('input,select,textarea')) continue;
      push(el.textContent);
    }
    var out = lines.join('\n');
    if (out.length > limit) out = out.slice(0, limit) + '\n...(snapshot trimmed)';
    return out;
  }

  function systemPrompt() {
    return C.systemPrompt || ("You are Alec, a helpful GTM and marketing analyst built into North's " + C.moduleLabel +
      " module. The user is looking at one screen of the app; you are given the page name, a structured summary where " +
      "available, a text snapshot of what is visible on screen, and the recent conversation. Answer ONLY from that context -- " +
      "never invent numbers, names or records. If the answer depends on data that isn't in the context, say it isn't visible " +
      "on this screen and suggest where in North they could look. Give practical, specific advice when asked. Be concise: " +
      "plain text or a few short bullet points, no markdown headings, no tables.");
  }
  function buildContext(q) {
    var pi = pageInfo(), parts = [];
    parts.push('MODULE: ' + C.moduleLabel + ' (North) | PAGE: ' + pi.label + ' [' + pi.id + ']' + (C.extraHeader ? ' | ' + C.extraHeader() : ''));
    try { var s = C.summary && C.summary(); if (s) parts.push('STRUCTURED SUMMARY:\n' + (typeof s === 'string' ? s : JSON.stringify(s))); } catch (e) {}
    parts.push('VISIBLE ON SCREEN:\n' + (snapshot(6000) || '(nothing readable on screen)'));
    var turns = S.msgs.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; });
    var hist = turns.slice(-7, -1).map(function (m) { return (m.role === 'user' ? 'User: ' : 'Alec: ') + m.text; }).join('\n');
    if (hist) parts.push('CONVERSATION SO FAR:\n' + hist);
    parts.push('CURRENT QUESTION: ' + q);
    return parts.join('\n\n');
  }

  async function providerFor(taskId, token) {
    var CONTACT_URL = g('CONTACT_URL'), hub = g('_hubOrgSlug') || '', sb = g('sb');
    if (taskId && token && CONTACT_URL) {
      try {
        var r = await fetch(CONTACT_URL + '/registry/task-provider?task_id=' + encodeURIComponent(taskId) + '&token=' + encodeURIComponent(token) + '&org=' + encodeURIComponent(hub));
        if (r.ok) { var j = await r.json().catch(function () { return {}; }); if (j && j.ai_provider) return { provider: j.ai_provider, model: j.ai_model || undefined }; }
      } catch (e) {}
    }
    try {
      var map = { 'Anthropic': 'anthropic', 'OpenAI': 'openai', 'Google Gemini': 'gemini' };
      var res = await sb.from('llm_providers').select('kind,model').eq('org_id', orgId()).eq('enabled', true).limit(1).maybeSingle();
      if (res.error || !res.data || !map[res.data.kind]) return {};
      return { provider: map[res.data.kind], model: res.data.model || undefined };
    } catch (e) { return {}; }
  }
  async function callAI(prompt, context, taskId) {
    var sb = g('sb'), CONTACT_URL = g('CONTACT_URL');
    var sess = await sb.auth.getSession();
    var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
    if (!token) throw new Error('Your own North session has expired -- sign in again.');
    var pm = await providerFor(taskId, token);
    var resp = await fetch(CONTACT_URL + '/admin/ai-generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, prompt: prompt, context: context, provider: pm.provider, model: pm.model })
    });
    var j = await resp.json().catch(function () { return {}; });
    if (resp.status === 501) { var err = new Error(typeof j.error === 'string' ? j.error : 'not configured'); err.notConfigured = true; throw err; }
    if (!resp.ok || !j.ok) { var er = j.error; throw new Error(typeof er === 'string' ? er : (er ? JSON.stringify(er) : ('AI request failed (' + resp.status + ')'))); }
    var out = String(j.raw || '').trim();
    if (!out) throw new Error('The AI returned nothing usable.');
    return out;
  }
  function pushErr(e) {
    if (e && e.notConfigured) { S.msgs.push({ role: 'warn', text: 'The AI provider isn’t configured yet (' + e.message + '). An admin can set one up under Configuration → LLM providers.' }); S.lastQ = ''; return; }
    var raw = (e && e.message) != null ? e.message : e;
    S.msgs.push({ role: 'error', text: 'Couldn’t get an answer: ' + (typeof raw === 'string' ? raw : (function () { try { return JSON.stringify(raw); } catch (_e) { return String(raw); } })()) });
  }

  function build() {
    if (S.built) return; S.built = true;
    var st = document.createElement('style'); st.id = 'askalec-css'; st.textContent = CSS; document.head.appendChild(st);
    var el = document.createElement('aside');
    el.id = 'asstPanel'; el.className = 'asst no-print';
    el.setAttribute('role', 'complementary'); el.setAttribute('aria-label', 'Ask Alec');
    el.innerHTML = '<div class="asst-hd"><b>&#10022; Ask Alec</b><span class="pg" id="asstPg"></span><span class="sp"></span>' +
      '<button class="asst-ib" id="asstClear" type="button" onclick="NorthAskAlec.clear()" aria-label="Clear conversation" title="Clear conversation">&#8634;</button>' +
      '<button class="asst-ib" id="asstPin" type="button" onclick="NorthAskAlec.togglePin()" aria-pressed="false" aria-label="Pin panel open" title="Pin: keep the panel docked open">&#128204;</button>' +
      '<button class="asst-ib" id="asstClose" type="button" onclick="NorthAskAlec.close()" aria-label="Close Ask Alec" title="Close (Esc)">&times;</button></div>' +
      '<div class="asst-log" id="asstLog" aria-live="polite"></div>' +
      '<div class="asst-ft"><textarea id="asstInput" rows="2" placeholder="Ask Alec about this screen..." aria-label="Ask Alec about this screen" onkeydown="NorthAskAlec.key(event)"></textarea>' +
      '<div class="row2"><span class="hint">Enter to send &middot; Shift+Enter for a new line</span>' +
      '<button class="btn sm pri" id="asstSendBtn" type="button" onclick="NorthAskAlec.sendFromInput()" aria-label="Send question">Send</button></div></div>';
    document.body.appendChild(el);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open && !S.pinned) close(); });
    var fixTop = function () { var tn = document.getElementById('topnav'); var b = tn && tn.offsetParent !== null ? Math.max(0, tn.getBoundingClientRect().bottom) : 0; document.documentElement.style.setProperty('--asst-top', Math.round(b) + 'px'); };
    window.addEventListener('resize', fixTop); window.addEventListener('scroll', fixTop, { passive: true });
    S.fixTop = fixTop;
    if (!document.getElementById('tnAsstBtn')) {
      var b = document.createElement('button');
      b.className = 'btn sm'; b.id = 'tnAsstBtn'; b.type = 'button'; b.style.marginRight = '6px';
      b.setAttribute('aria-label', 'Ask Alec about this screen'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'asstPanel');
      b.title = 'Ask Alec about what’s on this screen'; b.innerHTML = '&#10022; Ask Alec';
      var help = document.getElementById('tnHelpBtn'), tn = document.getElementById('topnav');
      if (help && help.parentNode) help.parentNode.insertBefore(b, help); else if (tn) tn.appendChild(b);
    }
    var tbtn = document.getElementById('tnAsstBtn');
    if (tbtn) { tbtn.removeAttribute('onclick'); tbtn.onclick = function () { toggle(); }; tbtn.innerHTML = '&#10022; Ask Alec'; tbtn.setAttribute('aria-label', 'Ask Alec about this screen'); }
  }
  function apply() {
    build();
    var el = document.getElementById('asstPanel'), avail = available();
    if (S.fixTop) S.fixTop();
    var shown = S.open && avail;
    el.classList.toggle('open', shown);
    el.setAttribute('aria-hidden', shown ? 'false' : 'true');
    document.body.classList.toggle('asst-open', shown);
    document.body.classList.toggle('asst-pinned', shown && S.pinned);
    var pin = document.getElementById('asstPin');
    pin.setAttribute('aria-pressed', S.pinned ? 'true' : 'false');
    pin.title = S.pinned ? 'Unpin: panel will overlay and close on Esc' : 'Pin: keep the panel docked open';
    var tb = document.getElementById('tnAsstBtn');
    if (tb) { tb.style.display = avail ? '' : 'none'; tb.setAttribute('aria-expanded', shown ? 'true' : 'false'); }
    ls(C.lsKey + '_asst_open', S.open ? '1' : '0'); ls(C.lsKey + '_asst_pinned', S.pinned ? '1' : '0');
  }
  function renderLog() {
    var log = document.getElementById('asstLog'); if (!log || !C) return;
    var on = enabled(), pending = !C.isEnabled && S.enabledFlag === null;
    var h = '';
    if (!on && !pending) h += '<div class="asst-msg w" role="note"><strong>Ask Alec is turned off for this organization.</strong> An admin can turn it on in <a href="Norma.html" target="tool_North">Configuration &rarr; Integrations</a> (the AI screen interpreter / Ask Alec setting). Nothing is sent to an AI provider while it’s off.</div>';
    var ex = explainCfg();
    if (!S.msgs.length) {
      h += '<div class="asst-intro">Ask Alec about what’s on this screen, or for advice on what to do next. Alec only sees what’s visible on <b>' + esc(pageInfo().label) + '</b> plus a summary of its numbers &mdash; not individual contact or deal records.</div>';
      if (on) h += '<div class="asst-sugg" aria-label="Suggested questions">' + starters().map(function (q) { return '<button type="button" data-q="' + esc(q) + '" onclick="NorthAskAlec.send(this.dataset.q)">' + esc(q) + '</button>'; }).join('') + '</div>';
    }
    if (ex && on) h += '<button type="button" class="asst-explain" onclick="NorthAskAlec.explain()" ' + (S.busy ? 'disabled' : '') + ' title="Alec’s one-click explanation of this screen — summary numbers only, never raw records">&#10024; ' + esc(ex.label || 'Explain this screen') + '</button>';
    S.msgs.forEach(function (m, i) {
      var cls = m.role === 'user' ? 'u' : m.role === 'assistant' ? 'a' : m.role === 'warn' ? 'w' : 'e';
      h += '<div class="asst-msg ' + cls + '"' + (m.role === 'user' ? ' aria-label="You said"' : '') + '>' + esc(m.text) +
        (m.role === 'error' && i === S.msgs.length - 1 && S.lastQ ? '<br><button class="btn sm" style="margin-top:6px" type="button" onclick="NorthAskAlec.retry()">Try again</button>' : '') + '</div>';
    });
    if (S.busy) h += '<div class="asst-msg a typing">Alec is reading the screen&hellip;</div>';
    log.innerHTML = h; log.scrollTop = log.scrollHeight;
    var inp = document.getElementById('asstInput'), btn = document.getElementById('asstSendBtn');
    if (inp) { inp.disabled = !on; inp.placeholder = on ? 'Ask Alec about this screen...' : (pending ? 'Checking whether Ask Alec is on...' : 'Ask Alec is off -- see note above'); }
    if (btn) btn.disabled = !on || S.busy;
  }
  function sync() {
    if (!C) return;
    build();
    var pg = document.getElementById('asstPg'); if (pg) pg.textContent = '· ' + pageInfo().label;
    apply(); renderLog();
  }
  function open() { S.open = true; apply(); renderLog(); setTimeout(function () { var i = document.getElementById('asstInput'); if (i && !i.disabled) i.focus(); else { var c = document.getElementById('asstClose'); if (c) c.focus(); } }, 60); }
  function close() { S.open = false; apply(); var tb = document.getElementById('tnAsstBtn'); if (tb && tb.style.display !== 'none') tb.focus(); }
  function toggle() { S.open ? close() : open(); }
  function togglePin() { S.pinned = !S.pinned; apply(); try { window.dispatchEvent(new Event('resize')); } catch (e) {} }
  function clear() { S.msgs = []; S.lastQ = ''; renderLog(); }
  function key(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFromInput(); } }
  function sendFromInput() { var i = document.getElementById('asstInput'); if (!i) return; var t = i.value; if (!t.trim() || S.busy) return; i.value = ''; send(t); }
  function retry() { if (!S.lastQ || S.busy) return; if (S.msgs.length && S.msgs[S.msgs.length - 1].role === 'error') S.msgs.pop(); if (S.lastKind === 'explain') explain(true); else send(S.lastQ, true); }
  async function send(text, isRetry) {
    text = String(text || '').trim();
    if (!text || S.busy) return;
    if (!S.open) open();
    if (!enabled()) { renderLog(); return; }
    if (!isRetry) S.msgs.push({ role: 'user', text: text });
    S.lastQ = text; S.lastKind = 'chat'; S.busy = true; renderLog();
    try { var out = await callAI(systemPrompt() + '\n\nQuestion: ' + text, buildContext(text), C.taskId); S.msgs.push({ role: 'assistant', text: out }); S.lastQ = ''; }
    catch (e) { pushErr(e); }
    finally { S.busy = false; renderLog(); }
  }
  /* The original Ask Alec button's exact request: skill instructions + only the skill's
     whitelisted summary fields + its own task id. */
  async function explain(isRetry) {
    var ex = explainCfg(); if (!ex || S.busy) return;
    if (!S.open) open();
    if (!enabled()) { renderLog(); return; }
    if (!isRetry) S.msgs.push({ role: 'user', text: ex.label || 'Explain this screen' });
    S.lastQ = ex.label || 'explain'; S.lastKind = 'explain'; S.busy = true; renderLog();
    try {
      var sr = await fetch(ex.skillUrl);
      if (!sr.ok) throw new Error('Could not load the Ask Alec skill definition (' + ex.skillUrl + ').');
      var skill = await sr.json();
      var full = ex.contextFn(), allow = {}, filtered = {};
      (skill.max_context_fields || []).forEach(function (k) { allow[k] = 1; });
      Object.keys(full || {}).forEach(function (k) { if (allow[k]) filtered[k] = full[k]; });
      var out = await callAI(skill.instructions, JSON.stringify(filtered), ex.taskId);
      S.msgs.push({ role: 'assistant', text: out }); S.lastQ = '';
    } catch (e) { pushErr(e); }
    finally { S.busy = false; renderLog(); }
  }
  function init(cfg) {
    C = cfg;
    S.pinned = ls(cfg.lsKey + '_asst_pinned') === '1';
    S.open = ls(cfg.lsKey + '_asst_open') === '1';
    /* Every module re-renders #main on each page change / edit, so re-sync (button visibility,
       page label) whenever #main's content is replaced -- no per-module render() hook needed.
       Nothing is built until the app has rendered its first real page (i.e. after sign-in). */
    var hook = function () {
      var main = document.getElementById('main'); if (!main) return setTimeout(hook, 200);
      var t = null;
      new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { try { sync(); } catch (e) { console.warn('Ask Alec sync', e); } }, 40); })
        .observe(main, { childList: true });
      if (main.children.length) { try { sync(); } catch (e) {} }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  }
  window.NorthAskAlec = { init: init, sync: sync, open: open, close: close, toggle: toggle, togglePin: togglePin, clear: clear, key: key,
    send: send, sendFromInput: sendFromInput, retry: retry, explain: explain, snapshot: snapshot, _state: S };
})();
