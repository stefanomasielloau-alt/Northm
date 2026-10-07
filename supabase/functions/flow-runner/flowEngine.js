/* shared/flowEngine.js -- North flow engine (2026-09-29, Stef: "complete phases 2b and 3").
   ONE pure, DOM-free implementation of how a flow behaves, used by:
     - Schema.html's Simulate / Simulate all / Replay (browser, window.FlowEngine), and
     - the flow-runner Edge Function (Deno; a byte-identical copy lives at
       supabase/functions/flow-runner/flowEngine.js -- see
       "Claude outputs/2026-09-29-check-flow-engine-copy.py").
   UMD: CommonJS (module.exports) when available, else sets globalThis.FlowEngine.
   Nothing in here touches the DOM, the network or the database. Everything outside the
   flow graph comes in through `ctx`:
     ctx.now            ms timestamp ("today" for time-in-step checks)
     ctx.mode           'sim' (Simulate / Replay) or 'run' (the real runtime)
     ctx.flowById(id)   -> flow {id,name,nodes,edges,flow}  (for hand-offs / subflows)
     ctx.bundleByRef(ref), ctx.ruleById(id)
     ctx.describe(action, record, pseudoRule) -> text   (optional; nicer preview wording)
     ctx.whenText(rule) -> text, ctx.stepLabel(procKey, step) -> text, ctx.fmt(v) -> text (optional)
     ctx.rowsOf(table)  -> rows (only for the lead -> deal step)
   State (from initRun) is plain JSON except `backBy` (a cache, rebuilt on demand) -- use
   serialize() before storing it. */
(function (root, factory) {
  if (typeof module === 'object' && module && module.exports) module.exports = factory();
  else root.FlowEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';
  var VERSION = '2026-09-29.1';
  var DAY = 86400000;

  var KINDS = {
    trigger: { label: 'Trigger', icon: '⚡' }, condition: { label: 'Condition', icon: '◆' },
    wait: { label: 'Wait', icon: '⏳' }, action: { label: 'Action', icon: '▶' }, bundle: { label: 'Bundle', icon: '▦' },
    split: { label: 'Split', icon: '⑂' }, join: { label: 'Join', icon: '⑃' }, subflow: { label: 'Subflow', icon: '↪' },
    end: { label: 'End', icon: '■' }, step: { label: 'Step', icon: '●' }
  };
  var ACTION_LABELS = { note: 'Log a note', alert: 'Alert people', email: 'Send email', task: 'Create a task', escalate: 'Escalate',
    calc: 'Calculate a field', webhook: 'Call webhook', agent: 'AI agent', chat: 'Chat message', http_pull: 'Pull from a URL', connector: 'App / connector' };
  var OPS = { eq: '=', ne: '≠', gt: '>', lt: '<', contains: 'contains', empty: 'is empty' };

  /* ---------- system processes: how a raw row maps onto a step ---------- */
  var PROCESSES = {
    campaign: { table: 'campaigns', stepField: 'signoff_status', valueField: 'budget', page: 'CampaignPlanning.html', type: 'campaign' },
    deal: { table: 'augur_deals', stepField: 'stage', valueField: 'value', page: 'Scoring.html', type: 'deal' },
    event: { table: 'eventus_events', stepField: 'status', valueField: 'budget', page: 'Events.html', type: 'event' },
    task: { table: 'tasks', stepField: 'status', valueField: 'planned_cost', page: 'CampaignPlanning.html', type: 'task' },
    asset: { table: 'assets', stepField: null, valueField: 'stock', page: 'AssetRegister.html', type: 'asset' },
    campaign_budget: { table: 'campaigns', stepField: null, valueField: 'budget', page: 'CampaignPlanning.html', type: 'campaign' },
    plan_commit: { table: null, stepField: null, valueField: null, page: 'Strategy.html', type: 'none' },
    lead: { table: 'prospectus_leads', stepField: 'status', valueField: null, page: 'Targets.html', type: 'lead' }
  };
  function processesForTable(table) { var out = []; for (var k in PROCESSES) if (PROCESSES[k].table === table) out.push(k); return out; }
  function todayISO(now) { return new Date(now == null ? Date.now() : now).toISOString().slice(0, 10); }
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isNaN(n) ? null : n; }
  function numLoose(v) { var n = Number(v); return isNaN(n) ? null : n; } /* same as the preview's prNum: Number('')===0 */
  function assetStep(a) {
    var s = a.stock == null ? null : Number(a.stock), lo = a.low_stock_at == null ? null : Number(a.low_stock_at);
    if (s == null || isNaN(s)) return 'Untracked';
    if (s <= 0) return 'Out';
    if (lo != null && !isNaN(lo) && s <= lo) return 'Low';
    return 'OK';
  }
  function normCo(x) { return String(x || '').toLowerCase().replace(/\b(pty|ltd|limited|inc|llc|co)\b/g, '').replace(/[^a-z0-9]/g, ''); }
  function stepOf(procKey, r, ctx) {
    ctx = ctx || {}; var P = PROCESSES[procKey]; if (!P || !r) return '(not set)';
    if (procKey === 'campaign_budget') {
      var b = Number(r.budget) || 0; if (!b) return '(not set)';
      if ((Number(r.actual) || 0) > b * 1.1) return 'Over budget';
      var pct = (r.alert_threshold_pct == null || r.alert_threshold_pct === '') ? 100 : Number(r.alert_threshold_pct);
      if ((Number(r.committed) || 0) >= b * pct / 100) return 'At alert threshold';
      return 'Within budget';
    }
    if (procKey === 'lead') {
      var c = normCo(r.company);
      var deals = ctx.rowsOf ? (ctx.rowsOf('augur_deals') || []) : [];
      if (c && r.status !== 'Disqualified' && deals.some(function (d) { var a = normCo(d.account), nm = normCo(d.name); return (a && (a === c || a.indexOf(c) === 0 || c.indexOf(a) === 0)) || (nm && nm.indexOf(c) === 0); })) return 'Deal created';
      return (r.status == null || r.status === '') ? '(not set)' : String(r.status);
    }
    if (procKey === 'asset') return assetStep(r);
    if (procKey === 'task' && r.due_date && String(r.due_date).slice(0, 10) < todayISO(ctx.now) && r.status !== 'Completed') return 'Overdue';
    var v = P.stepField ? r[P.stepField] : null;
    return (v == null || v === '') ? '(not set)' : String(v);
  }
  function ownerOf(row, ctx) {
    var direct = row.owner_name || row.owner || row.assignee_name || row.assigned_to_name;
    if (direct && typeof direct === 'string' && !/^[0-9a-f-]{36}$/i.test(direct)) return direct;
    var oid = row.owner_id || row.assignee_id || (typeof row.owner === 'string' ? row.owner : null);
    return (oid && ctx && ctx.userName) ? (ctx.userName(oid) || '') : '';
  }
  /* raw row -> record {id,name,step,stepLabel,fields,value,owner,link,type} */
  function normalize(procKey, r, ctx) {
    ctx = ctx || {}; var P = PROCESSES[procKey] || {};
    var step = stepOf(procKey, r, ctx);
    return { id: r.id, type: P.type || 'none', name: r.name || r.title || r.company || r.contact_name || '(unnamed)', step: step,
      stepLabel: ctx.stepLabel ? (ctx.stepLabel(procKey, step) || step) : step, fields: r,
      value: (P.valueField && r[P.valueField] != null) ? r[P.valueField] : '', owner: ownerOf(r, ctx),
      link: ctx.link ? ctx.link(P.page || '') : (P.page || '') };
  }

  /* ---------- small pure helpers (same definitions the preview always used) ---------- */
  function daysSince(v, now) { var t = Date.parse(v); return isNaN(t) ? null : Math.floor(((now == null ? Date.now() : now) - t) / DAY); }
  function fill(text, m) {
    m = m || {};
    return String(text == null ? '' : text).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (all, k) {
      if (k === 'name') return m.name || '';
      if (k === 'step') return m.stepLabel || m.step || '';
      if (k === 'owner') return m.owner || '(no owner)';
      if (k === 'value') return (m.value === '' || m.value == null) ? '' : String(m.value);
      if (k === 'link') return m.link || '';
      if (m.fields && m.fields[k] != null) return String(m.fields[k]);
      return all;
    });
  }
  function fillAction(a, m) {
    var out = {}; for (var k in a) { var v = a[k]; out[k] = (typeof v === 'string') ? fill(v, m) : (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v); }
    return out;
  }
  function condHolds(c, m) {
    var v = m.fields ? m.fields[c.field] : undefined;
    if (c.op === 'empty') return v == null || v === '' || (Array.isArray(v) && !v.length);
    var sv = v == null ? '' : String(v), cv = String(c.value == null ? '' : c.value);
    if (c.op === 'contains') return sv.toLowerCase().indexOf(cv.toLowerCase()) >= 0;
    var a = numLoose(v), b = numLoose(c.value);
    if (c.op === 'gt') return a != null && b != null && a > b;
    if (c.op === 'lt') return a != null && b != null && a < b;
    var same = (a != null && b != null && sv !== '' && cv !== '') ? a === b : sv.toLowerCase() === cv.toLowerCase();
    return c.op === 'ne' ? !same : same;
  }
  function thresholdHolds(w, m) {
    var x = numLoose(m.fields ? m.fields[w.field] : null); var lim = numLoose(w.value);
    if (x == null || lim == null) return false;
    if (w.pctOf) { var base = numLoose(m.fields[w.pctOf]); if (!base) return false; x = x / base * 100; }
    if (w.op === 'gt') return x > lim; if (w.op === 'ge') return x >= lim; if (w.op === 'lt') return x < lim; if (w.op === 'le') return x <= lim;
    return false;
  }
  function unitText(a, u) { return a + ' ' + ({ minutes: 'minute', hours: 'hour', days: 'day', bdays: 'business day' }[u] || u) + (Number(a) === 1 ? '' : 's'); }
  function daysToCal(amount, unit, fromMs) {
    var a = Number(amount) || 0;
    if (unit === 'minutes') return a / 1440; if (unit === 'hours') return a / 24;
    if (unit === 'bdays') { var d = 0, left = a, dt = new Date(fromMs == null ? Date.now() : fromMs); while (left > 0) { dt.setDate(dt.getDate() + 1); d++; var wd = dt.getDay(); if (wd !== 0 && wd !== 6) left--; } return d; }
    return a;
  }
  function needsApproval(a) {
    if (!a) return false;
    if (a.requireApproval === true) return true;
    if (a.requireApproval === false) return false;
    if (a.type === 'calc') return true;                                   /* writes a field */
    if (a.intoField && (a.type === 'http_pull' || a.type === 'connector' || (a.type === 'agent' && a.mode === 'pull'))) return true;
    return false;
  }

  /* ---------- graph helpers ---------- */
  function kindOf(n) { return (n && n.kind && KINDS[n.kind]) ? n.kind : 'step'; }
  function nodeTitle(n) { return (n && n.label) || KINDS[kindOf(n)].label; }
  function byId(list, id) { for (var i = 0; i < (list || []).length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  function out(w, id) { return (w.edges || []).filter(function (e) { return e.fromId === id; }); }
  function inc(w, id) { return (w.edges || []).filter(function (e) { return e.toId === id; }); }
  function triggers(w) { return (w.nodes || []).filter(function (n) { return n.kind === 'trigger'; }); }
  function backEdges(w) {
    var back = new Set(), state = {};
    function visit(id) {
      state[id] = 1;
      out(w, id).forEach(function (e) { if (state[e.toId] === 1) back.add(e.id); else if (!state[e.toId]) visit(e.toId); });
      state[id] = 2;
    }
    triggers(w).forEach(function (t) { if (!state[t.id]) visit(t.id); });
    (w.nodes || []).forEach(function (n) { if (!state[n.id]) visit(n.id); });
    return back;
  }
  function reach(w, fromIds, edgeFilter) {
    var seen = new Set(), st = fromIds.slice();
    while (st.length) { var id = st.pop(); if (seen.has(id)) continue; seen.add(id); out(w, id).filter(function (e) { return !edgeFilter || edgeFilter(e); }).forEach(function (e) { st.push(e.toId); }); }
    return seen;
  }
  function boundKey(w) {
    if (!w) return null;
    if (w.flow && w.flow.builtin) return w.flow.builtin;
    var t = triggers(w).filter(function (t) { return t.config && t.config.procKey; })[0];
    return t ? t.config.procKey : null;
  }
  function handoffOf(n) { var h = n && n.attach && n.attach.handoff; return (h && h.flowId) ? h : null; }
  function flowOf(ctx, id) { return ctx && ctx.flowById ? ctx.flowById(id) : null; }

  /* ---------- triggers ---------- */
  function whenText(ctx, r) {
    if (ctx && ctx.whenText) return ctx.whenText(r);
    var w = r.when || {}, st = (ctx && ctx.stepLabel) ? ctx.stepLabel(r.procKey, r.step) : r.step;
    if (w.type === 'enters') return 'Enters "' + st + '"';
    if (w.type === 'stuck') return 'Still at "' + st + '" after ' + (w.days || 0) + ' days';
    if (w.type === 'threshold') return 'At "' + st + '" and ' + (w.field || '?') + ' crosses ' + w.value;
    if (w.type === 'schedule') return 'Every ' + ({ daily: 'day', weekly: 'week', hourly: 'hour' }[w.freq] || w.freq) + ' for records at "' + st + '"';
    if (w.type === 'inbound') return 'Inbound webhook';
    if (w.type === 'external') return 'External event "' + (w.key || '?') + '"';
    if (w.type === 'manual') return 'Manual (Run now)';
    if (w.type === 'flow_finished') return 'Another flow finishes';
    return w.type || '—';
  }
  /* Does trigger node n fire for record m *right now* (Simulate, and time-based checks in the runtime)? */
  function triggerFires(n, m, w, ctx) {
    var c = n.config || {}, wh = c.when || {};
    if (wh.type === 'inbound') return { ok: false, why: 'fires when the flow\'s inbound webhook is called' };
    if (!m) return { ok: false, why: 'no record' };
    if (c.procKey && c.procKey !== boundKey(w)) return { ok: false, why: 'bound to a different process (' + ((ctx && ctx.procLabel) ? ctx.procLabel(c.procKey) : c.procKey) + ')' };
    var stepL = (ctx && ctx.stepLabel) ? (ctx.stepLabel(c.procKey, c.step) || c.step) : c.step;
    var at = !c.step || m.step === c.step;
    if (wh.type === 'external') return { ok: false, why: 'fires on an external event — can\'t be tested against a record' };
    if (wh.type === 'flow_finished') return { ok: false, why: 'fires when another flow finishes' };
    if (!at) return { ok: false, why: 'record is at “' + m.stepLabel + '”, not “' + stepL + '”' };
    if (wh.type === 'stuck') {
      var d = wh.dateField ? daysSince(m.fields[wh.dateField], ctx && ctx.now) : null;
      if (d == null) return { ok: false, why: 'no ' + (wh.dateField || 'date') + ' on this record' };
      return d >= (Number(wh.days) || 0) ? { ok: true, why: 'at “' + stepL + '” for ' + d + ' days (≥ ' + wh.days + ')' } : { ok: false, why: 'only ' + d + ' days at “' + stepL + '” (needs ' + wh.days + ')' };
    }
    if (wh.type === 'threshold') { var ok = thresholdHolds(wh, m); return { ok: ok, why: (wh.field || '?') + ' ' + (ok ? 'crosses' : 'does not cross') + ' the threshold' }; }
    return { ok: true, why: 'record is at “' + stepL + '”' + (wh.type === 'schedule' ? ' (on the next scheduled run)' : wh.type === 'manual' ? ' (when someone clicks Run now)' : '') };
  }
  /* Runtime: does a record CHANGE (oldM -> newM, same process) start trigger n? Only the event-driven
     WHEN types answer here; time-in-step and schedules are evaluated on the minute tick. */
  function eventMatches(n, oldM, newM, w) {
    var c = n.config || {}, wh = c.when || {};
    if (!newM) return false;
    if (c.procKey && c.procKey !== boundKey(w)) return false;
    if (wh.type === 'enters') return newM.step === c.step && (!oldM || oldM.step !== c.step);
    if (wh.type === 'threshold') return (!c.step || newM.step === c.step) && thresholdHolds(wh, newM) && !(oldM && (!c.step || oldM.step === c.step) && thresholdHolds(wh, oldM));
    return false;
  }
  function ruleFires(r, m, ctx) {
    var pseudo = { config: { procKey: r.procKey, step: r.step, when: r.when || { type: 'enters' } } };
    var res = triggerFires(pseudo, m, { flow: { builtin: r.procKey }, nodes: [] }, ctx);
    if (!res.ok) return res;
    var bad = (r.conds || []).filter(function (c) { return c.field && !condHolds(c, m); });
    return bad.length ? { ok: false, why: 'IF ' + bad.map(function (c) { return c.field + ' ' + (OPS[c.op] || c.op) + (c.op === 'empty' ? '' : ' ' + c.value); }).join(', ') + ' doesn\'t hold' } : res;
  }
  function ruleEventMatches(r, oldM, newM) {
    if (!newM || (r.enabled === false)) return false;
    var pseudo = { config: { procKey: r.procKey, step: r.step, when: r.when || { type: 'enters' } } };
    if (!eventMatches(pseudo, oldM, newM, { flow: { builtin: r.procKey }, nodes: [] })) return false;
    return !(r.conds || []).some(function (c) { return c.field && !condHolds(c, newM); });
  }
  /* A System-processes draft trigger as a tiny flow: trigger -> (conditions) -> actions -> end. */
  function ruleToFlow(r) {
    var nodes = [], edges = [], i = 0;
    function nid() { return 'r' + (i++); }
    var t = { id: nid(), kind: 'trigger', label: r.name || 'Trigger', config: { procKey: r.procKey, step: r.step, when: r.when || { type: 'enters' } } };
    nodes.push(t); var prev = t, lab = '';
    var conds = (r.conds || []).filter(function (c) { return c.field; });
    if (conds.length) {
      var cn = { id: nid(), kind: 'condition', label: 'Conditions', config: { paths: [{ id: 'p', name: 'Match', join: 'and', groups: [{ join: 'and', rules: conds }] }] } };
      nodes.push(cn); edges.push({ id: 'e' + i, fromId: prev.id, toId: cn.id, label: '' });
      var sk = { id: nid(), kind: 'end', label: 'Skipped', config: { outcome: 'Skipped' } }; nodes.push(sk); edges.push({ id: 'e' + i + 'x', fromId: cn.id, toId: sk.id, label: 'else' });
      prev = cn; lab = 'Match';
    }
    (r.actions || []).forEach(function (a) { var an = { id: nid(), kind: 'action', label: ACTION_LABELS[a.type] || 'Action', config: { actions: [a] } }; nodes.push(an); edges.push({ id: 'e' + i, fromId: prev.id, toId: an.id, label: lab }); prev = an; lab = ''; });
    var en = { id: nid(), kind: 'end', label: 'Done', config: { outcome: 'Done' } }; nodes.push(en); edges.push({ id: 'e' + i + 'end', fromId: prev.id, toId: en.id, label: '' });
    return { id: 'rule:' + r.id, name: r.name || 'System trigger', nodes: nodes, edges: edges, flow: { kind: 'flow', builtin: r.procKey } };
  }

  /* ---------- conditions / waits ---------- */
  function fmtV(ctx, v) {
    if (ctx && ctx.fmt) return ctx.fmt(v);
    if (v == null || v === '') return '—'; if (typeof v === 'number') return v.toLocaleString('en-AU'); if (typeof v === 'object') return JSON.stringify(v).slice(0, 60); return String(v);
  }
  function ruleText(r, m, ctx) {
    var v = m.fields ? m.fields[r.field] : undefined, op = OPS[r.op] || r.op, ok = condHolds(r, m);
    return { ok: ok, text: (r.field || '?') + ' (' + (v == null || v === '' ? 'empty' : fmtV(ctx, v)) + ') ' + op + (r.op === 'empty' ? '' : ' ' + r.value) + ' → ' + (ok ? '✓' : '✗') };
  }
  function evalCondition(n, m, ctx) {
    var paths = (n.config || {}).paths || [], lines = [];
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var gRes = (p.groups || []).map(function (g) {
        var rs = (g.rules || []).filter(function (r) { return r.field; }).map(function (r) { return ruleText(r, m, ctx); });
        var ok = rs.length ? (g.join === 'or' ? rs.some(function (x) { return x.ok; }) : rs.every(function (x) { return x.ok; })) : false;
        return { ok: ok, rs: rs, join: g.join };
      });
      var ok = gRes.length ? (p.join === 'or' ? gRes.some(function (g) { return g.ok; }) : gRes.every(function (g) { return g.ok; })) : false;
      lines.push('Path “' + p.name + '”: ' + (ok ? 'matches' : 'no match') + ' — ' + (gRes.map(function (g) { return '(' + g.rs.map(function (x) { return x.text; }).join(g.join === 'or' ? ' OR ' : ' AND ') + ')'; }).join(p.join === 'or' ? ' OR ' : ' AND ') || 'no rules'));
      if (ok) return { path: p.name, lines: lines };
    }
    return { path: 'else', lines: lines.concat(['No path matched → Else']) };
  }
  function eventHappened(c, m, procKey) {
    if (c.event === 'reply') return { ok: false, note: 'replies aren\'t tracked yet' };
    var target = c.eventValue || (c.event === 'approval' ? (procKey === 'deal' ? 'Closed Won' : 'Approved') : '');
    if (!target) return { ok: false, note: 'no status picked' };
    return { ok: m.step === target, note: 'record is ' + (m.step === target ? '' : 'not ') + 'at “' + target + '”', target: target };
  }

  /* ---------- runs ---------- */
  function initRun(w, m, opts, ctx) {
    opts = opts || {}; ctx = ctx || {};
    var now = ctx.now == null ? Date.now() : ctx.now;
    var S = { v: 1, wfId: w.id, recordId: m ? m.id : null, m: m, ff: opts.ff || 0, startedAt: opts.startedAt || now, tokens: [], log: [], hit: {}, edges: {}, loops: {}, joins: {}, joinWf: {}, joinFired: {}, ends: [], stuck: [], atStep: [], parked: [], steps: 0, done: false, backBy: {}, noFire: null, seq: 0 };
    if (opts.startNodeIds && opts.startNodeIds.length) {  /* runtime: the runner already decided which trigger fired */
      opts.startNodeIds.forEach(function (id) { S.tokens.push({ id: 'k' + (S.seq++), wfId: w.id, nodeId: id, t: 0, via: null, why: opts.why || '', depth: 0 }); });
      return S;
    }
    var trig = triggers(w);
    if (!trig.length) { S.stuck.push({ nodeId: null, reason: 'The flow has no trigger.' }); S.done = true; return S; }
    var res = trig.map(function (t) { return { t: t, r: triggerFires(t, m, w, ctx) }; });
    var start = res.filter(function (x) { return x.r.ok; });
    if (!start.length) {
      S.noFire = res.map(function (x) { return '“' + nodeTitle(x.t) + '”: ' + x.r.why; }).join('; ');
      if (!opts.assume) { S.done = true; return S; }
      var b = boundKey(w);
      start = [res.filter(function (x) { return (x.t.config || {}).procKey === b; })[0] || res[0]];
      S.log.push({ nodeId: null, title: 'No trigger fires for this record', lines: [S.noFire, 'Simulating as if “' + nodeTitle(start[0].t) + '” fired.'], cls: 'warn' });
    }
    start.forEach(function (x) { S.tokens.push({ id: 'k' + (S.seq++), wfId: w.id, nodeId: x.t.id, t: 0, via: null, why: x.r.why, depth: 0 }); });
    return S;
  }
  function backOf(S, ctx, wfId) {
    S.backBy = S.backBy || {};
    if (!S.backBy[wfId]) { var f = flowOf(ctx, wfId); S.backBy[wfId] = f ? backEdges(f) : new Set(); }
    return S.backBy[wfId];
  }
  function follow(S, ctx, w, n, edges, t, lines, tok) {
    var outT = [];
    edges.forEach(function (e) {
      if (backOf(S, ctx, w.id).has(e.id)) {
        var cnt = S.loops[e.id] || 0, max = Number(e.maxRepeats) || 0;
        if (!max) { if (cnt >= 10) { lines.push('Loop has no max repeats — stopped after 10.'); return; } }
        else if (cnt >= max) { lines.push('Loop limit reached (' + max + '×) — not looping again.'); return; }
        S.loops[e.id] = cnt + 1; lines.push('Loop back (' + (cnt + 1) + ' of ' + (max || '∞') + ').');
      }
      S.edges[e.id] = true; outT.push({ id: 'k' + (S.seq++), wfId: w.id, nodeId: e.toId, t: t, via: e.id, depth: (tok && tok.depth) || 0 });
    });
    return outT;
  }
  function describe(ctx, a, m, pseudo) {
    if (ctx && ctx.describe) return ctx.describe(a, m, pseudo);
    var f = fillAction(a, m || {});
    var t = ACTION_LABELS[a.type] || a.type;
    return t + (f.message ? ': “' + f.message + '”' : f.subject ? ': “' + f.subject + '”' : f.title ? ': “' + f.title + '”' : f.url ? ' ' + f.url : '');
  }
  /* Process ONE token. Returns {entry, actions}. `actions` is what the runtime must execute:
     [{wfId,nodeId,source,action,approval,bundle,ruleId}] -- Simulate only shows their descriptions. */
  function step(S, ctx) {
    ctx = ctx || {};
    var acts = [];
    var root = flowOf(ctx, S.wfId); if (!root) { S.done = true; return { entry: null, actions: acts }; }
    if (!S.tokens.length) { finish(S, ctx); return { entry: null, actions: acts }; }
    if (++S.steps > 400) { S.stuck.push({ nodeId: null, reason: 'Stopped after 400 steps (runaway loop?).' }); S.tokens = []; finish(S, ctx); return { entry: null, actions: acts }; }
    var tok = S.tokens.shift(); var w = flowOf(ctx, tok.wfId || S.wfId); if (!w) return { entry: null, actions: acts };
    var n = byId(w.nodes, tok.nodeId); if (!n) return { entry: null, actions: acts };
    var revisit = tok.revisit === n.id;
    S.hit[n.id] = true;
    var k = kindOf(n), c = n.config || {}, m = (ctx.record !== undefined ? ctx.record : S.m), pk = boundKey(w);
    var outE = out(w, n.id), lines = [], next = [];
    var day = function (t) { return t ? (' (day ' + (Math.round(t * 10) / 10) + ')') : ''; };
    var entry = { wfId: w.id, nodeId: n.id, kind: k, title: (w.id !== S.wfId ? '[' + w.name + '] ' : '') + KINDS[k].icon + ' ' + nodeTitle(n) + day(tok.t), lines: lines, cls: '' };
    var pseudo = { name: w.name, procKey: pk, step: m ? m.step : '', when: {} };
    var sim = ctx.mode !== 'run';
    var park = function (kind, extra) { var p = { kind: kind, token: { id: tok.id, wfId: w.id, nodeId: n.id, t: tok.t, depth: tok.depth || 0, why: tok.why, revisit: n.id }, nodeId: n.id, wfId: w.id }; for (var x in extra) p[x] = extra[x]; S.parked.push(p); return p; };
    var emit = function (a, source, extra) {
      var need = needsApproval(a);
      var o = { wfId: w.id, nodeId: n.id, tokenId: tok.id, source: source, action: a, approval: need };
      for (var x in (extra || {})) o[x] = extra[x];
      acts.push(o);
      return need;
    };
    if (k === 'trigger') { lines.push('WHEN ' + whenText(ctx, { procKey: c.procKey, step: c.step, when: c.when || {} })); if (tok.why) lines.push('Fires: ' + tok.why + '.'); next = follow(S, ctx, w, n, outE, tok.t, lines, tok); }
    else if (k === 'step') {
      if (n.builtin && m) {
        if (m.step === n.stepKey) {
          lines.push('Record is at this step now.');
          var extra = outE.filter(function (e) { var tn = byId(w.nodes, e.toId); return !(tn && tn.builtin); });
          if (extra.length && !revisit) next = follow(S, ctx, w, n, extra, tok.t, lines, tok);
          else { S.atStep.push({ wfId: w.id, nodeId: n.id, reason: 'record is at “' + n.label + '” now' }); entry.cls = 'end'; park('step', {}); }
        } else {
          var curNode = (w.nodes || []).filter(function (x) { return x.builtin && x.stepKey === m.step; })[0];
          var bOut = outE.filter(function (e) { var tn = byId(w.nodes, e.toId); return tn && tn.builtin; });
          var via = curNode ? bOut.filter(function (e) { return reach(w, [e.toId], function (ed) { var tn = byId(w.nodes, ed.toId); return tn && tn.builtin; }).has(curNode.id); })[0] : null;
          if (via) { lines.push('Record already passed this step.'); next = follow(S, ctx, w, n, [via], tok.t, lines, tok); }
          else { lines.push('Record isn\'t on this branch' + (curNode ? '' : ' (its step “' + m.stepLabel + '” isn\'t in this flow)') + '.'); entry.cls = 'muted'; }
        }
      } else { lines.push('Process step.'); next = follow(S, ctx, w, n, outE, tok.t, lines, tok); }
    }
    else if (k === 'condition') {
      var r = evalCondition(n, m || { fields: {} }, ctx); r.lines.forEach(function (l) { lines.push(l); });
      var es = outE.filter(function (e) { return (e.label || '').trim().toLowerCase() === String(r.path).trim().toLowerCase(); });
      if (!es.length) { S.stuck.push({ wfId: w.id, nodeId: n.id, reason: 'no connector labelled “' + r.path + '”' }); entry.cls = 'bad'; }
      else next = follow(S, ctx, w, n, es, tok.t, lines, tok);
    }
    else if (k === 'wait') {
      var cont = outE.filter(function (e) { return (e.label || '').trim().toLowerCase() !== 'timeout'; }), tmo = outE.filter(function (e) { return (e.label || '').trim().toLowerCase() === 'timeout'; });
      var T = c.mode === 'duration' ? 0 : daysToCal(c.timeoutAmount, c.timeoutUnit, S.startedAt);
      var timeoutOr = function (reason, untilDay) {
        if (T > 0 && tok.t + T <= S.ff && tmo.length) { lines.push(reason + ' — timed out after ' + unitText(c.timeoutAmount, c.timeoutUnit) + (sim ? ' (fast-forwarded)' : '') + '.'); next = follow(S, ctx, w, n, tmo, tok.t + T, lines, tok); entry.cls = 'warn'; }
        else {
          S.stuck.push({ wfId: w.id, nodeId: n.id, waiting: true, reason: reason + (T > 0 ? ('; times out on day ' + (Math.round((tok.t + T) * 10) / 10) + ((S.ff || !sim) ? '' : ' — turn on fast-forward to test it')) : '') });
          lines.push(reason + '.'); entry.cls = 'wait';
          var due = [T > 0 ? tok.t + T : null, untilDay == null ? null : untilDay].filter(function (x) { return x != null; });
          park('wait', { dueDay: due.length ? Math.min.apply(null, due) : null, until: c.mode });
        }
      };
      if (c.mode === 'duration') {
        var D = daysToCal(c.amount, c.unit, S.startedAt);
        if (tok.t + D <= S.ff) { lines.push('Waited ' + unitText(c.amount, c.unit) + (sim ? ' (fast-forwarded)' : '') + '.'); next = follow(S, ctx, w, n, cont, tok.t + D, lines, tok); }
        else { S.stuck.push({ wfId: w.id, nodeId: n.id, waiting: true, reason: 'waiting ' + unitText(c.amount, c.unit) + ' — resumes on day ' + (Math.round((tok.t + D) * 10) / 10) }); lines.push('Waiting ' + unitText(c.amount, c.unit) + '.'); entry.cls = 'wait'; park('wait', { dueDay: tok.t + D, until: 'duration' }); }
      } else if (c.mode === 'until_date') {
        var v = m && m.fields ? m.fields[c.dateField] : null, dsn = v ? daysSince(v, S.startedAt) : null, ds = dsn == null ? null : -dsn + (Number(c.dateOffset) || 0);
        if (ds == null) { lines.push('No ' + (c.dateField || 'date') + ' on this record.'); timeoutOr('Waiting for a date that isn\'t set', null); }
        else if (ds <= tok.t) { lines.push((c.dateField) + ' (' + fmtV(ctx, v) + ') has passed.'); next = follow(S, ctx, w, n, cont, tok.t, lines, tok); }
        else if (ds <= S.ff && !(T > 0 && tok.t + T < ds)) { lines.push('Reached ' + c.dateField + ' on day ' + ds + (sim ? ' (fast-forwarded)' : '') + '.'); next = follow(S, ctx, w, n, cont, ds, lines, tok); }
        else timeoutOr('Waiting until ' + c.dateField + ' (' + fmtV(ctx, v) + ')', ds);
      } else {
        var ev = eventHappened(c, m || {}, pk);
        if (ev.ok) { lines.push('Already happened: ' + ev.note + '.'); next = follow(S, ctx, w, n, cont, tok.t, lines, tok); }
        else timeoutOr('Waiting for ' + ({ approval: 'approval', status_change: 'a status change', reply: 'a reply' }[c.event] || c.event) + (ev.target ? (' (“' + ev.target + '”)') : '') + ' — ' + ev.note, null);
      }
    }
    else if (k === 'action' || k === 'bundle') {
      var list = c.actions || [], bname = null;
      if (k === 'bundle') { var bb = ((w.flow || {}).bundles || []).filter(function (x) { return x.id === c.bundleId; })[0]; list = bb ? bb.actions : []; bname = bb ? bb.name : null; lines.push('Bundle “' + (bb ? bb.name : '?') + '”:'); }
      var needAppr = false;
      if (!revisit) list.forEach(function (a) { var need = emit(a, k, { bundle: bname }); needAppr = needAppr || need; lines.push((sim ? 'Would run — ' : 'Runs — ') + (m ? describe(ctx, a, m, pseudo) : (ACTION_LABELS[a.type] || a.type)) + (need ? ' (needs approval)' : '')); });
      entry.cls = 'act';
      if (needAppr && !sim) {
        /* runtime: hold the token until the approval is decided; continuation is precomputed */
        var nx = follow(S, ctx, w, n, outE.filter(function (e) { return (e.label || '').trim().toLowerCase() !== 'rejected'; }), tok.t, lines, tok);
        var rj = outE.filter(function (e) { return (e.label || '').trim().toLowerCase() === 'rejected'; }).map(function (e) { return { id: 'k' + (S.seq++), wfId: w.id, nodeId: e.toId, t: tok.t, via: e.id, depth: tok.depth || 0 }; });
        park('approval', { onApprove: nx, onReject: rj }); lines.push('Waiting for approval before continuing.'); entry.cls = 'wait';
      } else next = follow(S, ctx, w, n, outE.filter(function (e) { return (e.label || '').trim().toLowerCase() !== 'rejected'; }), tok.t, lines, tok); /* a 'rejected' connector is only taken after a rejection */
    }
    else if (k === 'split') { lines.push('Splits into ' + outE.length + ' parallel branch' + (outE.length === 1 ? '' : 'es') + '.'); next = follow(S, ctx, w, n, outE, tok.t, lines, tok); }
    else if (k === 'join') {
      S.joinWf[n.id] = w.id;
      var incN = inc(w, n.id).filter(function (e) { return !backOf(S, ctx, w.id).has(e.id); }).length, need = c.rule === 'any' ? 1 : c.rule === 'first' ? (Number(c.n) || 1) : incN;
      var arr = S.joins[n.id] = (S.joins[n.id] || []); arr.push(tok.t);
      if (S.joinFired[n.id]) { lines.push('Branch arrived after the join already continued — ignored.'); entry.cls = 'muted'; }
      else if (arr.length >= need) { S.joinFired[n.id] = true; lines.push('Joined (' + arr.length + ' of ' + incN + ', rule: ' + (c.rule === 'first' ? 'first ' + need : c.rule) + ').'); next = follow(S, ctx, w, n, outE, Math.max.apply(null, arr), lines, tok); }
      else { lines.push('Waiting for branches (' + arr.length + ' of ' + need + ').'); entry.cls = 'wait'; }
    }
    else if (k === 'subflow') {
      var f = flowOf(ctx, c.flowId);
      lines.push(sim ? ('Would start subflow “' + (f ? f.name : '?') + '” (not simulated inside this run).') : ('Starts subflow “' + (f ? f.name : '?') + '”.'));
      if (f && !revisit) acts.push({ wfId: w.id, nodeId: n.id, tokenId: tok.id, source: 'subflow', action: { type: '__subflow', flowId: c.flowId }, approval: false });
      next = follow(S, ctx, w, n, outE, tok.t, lines, tok);
    }
    else if (k === 'end') { S.ends.push({ wfId: w.id, nodeId: n.id, outcome: c.outcome || n.label || 'End', t: tok.t }); lines.push('Outcome: ' + (c.outcome || n.label || 'End') + '.'); entry.cls = 'end'; }
    /* attached bundles, system-process triggers and hand-offs (first visit only) */
    var att = n.attach || {};
    if (!revisit) {
      (att.bundles || []).forEach(function (ref) {
        var b = ctx.bundleByRef ? ctx.bundleByRef(ref) : null; if (!b) { lines.push('Attached bundle missing.'); return; }
        lines.push('Attached bundle “' + b.name + '”:');
        (b.actions || []).forEach(function (a) { var need = emit(a, 'attached', { bundle: b.name, bundleRef: ref }); lines.push('  ' + (sim ? 'Would run — ' : 'Runs — ') + (m ? describe(ctx, a, m, pseudo) : (ACTION_LABELS[a.type] || a.type)) + (need ? ' (needs approval)' : '')); });
      });
      (att.triggers || []).forEach(function (id) {
        var rr = ctx.ruleById ? ctx.ruleById(id) : null; if (!rr) { lines.push('Attached system-process trigger not found in this browser.'); return; }
        var fr = m ? ruleFires(rr, m, ctx) : { ok: false, why: 'no record' };
        lines.push('System trigger “' + (rr.name || 'Untitled') + '”: ' + (fr.ok ? 'fires' : 'doesn\'t fire') + ' — ' + fr.why + '.');
        if (fr.ok) (rr.actions || []).forEach(function (a) { var need = emit(a, 'rule', { ruleId: id }); lines.push('  ' + (sim ? 'Would run — ' : 'Runs — ') + describe(ctx, a, m, rr) + (need ? ' (needs approval)' : '')); });
      });
      var ho = handoffOf(n);
      if (ho) {
        var tf = flowOf(ctx, ho.flowId), depth = (tok.depth || 0) + 1;
        if (!tf) { lines.push('Hand-off target flow no longer exists.'); S.stuck.push({ wfId: w.id, nodeId: n.id, reason: 'hand-off target missing' }); entry.cls = 'bad'; }
        else if (depth > 5) { lines.push('Hand-off depth limit (5) reached — not following into “' + tf.name + '”.'); S.stuck.push({ wfId: w.id, nodeId: n.id, reason: 'hand-off depth limit (5) reached' }); entry.cls = 'bad'; }
        else {
          var entryN = ho.entryNodeId ? byId(tf.nodes || [], ho.entryNodeId) : null;
          var starts = entryN ? [entryN] : triggers(tf);
          if (!starts.length) { lines.push('“' + tf.name + '” has no trigger to continue from.'); S.stuck.push({ wfId: w.id, nodeId: n.id, reason: 'linked flow has no trigger' }); entry.cls = 'bad'; }
          else { lines.push('↪ Continues in “' + tf.name + '”' + (entryN ? ' at “' + nodeTitle(entryN) + '”' : '') + '.'); starts.forEach(function (sn) { next.push({ id: 'k' + (S.seq++), wfId: tf.id, nodeId: sn.id, t: tok.t, via: null, depth: depth, why: 'handed off from “' + w.name + '”' }); }); }
        }
      }
    }
    var parkedHere = S.parked.length && S.parked[S.parked.length - 1].token.id === tok.id;
    var loopMsg = lines.some(function (l) { return /Loop limit|no max repeats/.test(l); });
    if (k !== 'end' && k !== 'join' && k !== 'wait' && !next.length && !loopMsg && entry.cls !== 'muted' && entry.cls !== 'bad' && !(k === 'step' && n.builtin) && !parkedHere) {
      S.stuck.push({ wfId: w.id, nodeId: n.id, reason: 'nowhere to go from here' }); entry.cls = 'bad';
    } else if (!next.length && loopMsg) { S.stuck.push({ wfId: w.id, nodeId: n.id, reason: 'loop limit reached' }); entry.cls = 'bad'; }
    entry.actions = acts.length;
    S.log.push(entry);
    next.forEach(function (x) { S.tokens.push(x); });
    if (!S.tokens.length) finish(S, ctx);
    return { entry: entry, actions: acts };
  }
  function finish(S, ctx) {
    if (S.done) return;
    Object.keys(S.joins).forEach(function (id) {
      if (!S.joinFired[id]) {
        var jw = flowOf(ctx, S.joinWf[id]) || flowOf(ctx, S.wfId); var n = jw ? byId(jw.nodes, id) : null, c = (n && n.config) || {};
        var incN = jw ? inc(jw, id).filter(function (e) { return !backOf(S, ctx, jw.id).has(e.id); }).length : 0;
        S.stuck.push({ wfId: jw ? jw.id : S.wfId, nodeId: id, waiting: true, reason: 'join waiting for ' + (c.rule === 'any' ? 1 : c.rule === 'first' ? c.n : incN) + ' branch(es), got ' + S.joins[id].length });
      }
    });
    S.done = true;
  }
  /* Run until nothing is runnable. Returns the list of actions produced along the way. */
  function run(S, ctx, max) {
    var all = [], g = 0; max = max || 2000;
    while (!S.done && g++ < max) { var r = step(S, ctx); r.actions.forEach(function (a) { all.push(a); }); }
    return all;
  }
  /* Runtime: re-check parked waits / "record at this step" tokens (called when time passes or the
     record changes). Approvals are resumed with resumeApproval(). */
  function resume(S, ctx, filter) {
    var keep = [], moved = 0;
    (S.parked || []).forEach(function (p) {
      if ((p.kind === 'wait' || p.kind === 'step') && (!filter || filter(p))) {
        S.tokens.push(p.token); moved++;
        S.stuck = S.stuck.filter(function (s) { return !(s.waiting && s.nodeId === p.nodeId); });
        S.atStep = S.atStep.filter(function (s) { return s.nodeId !== p.nodeId; });
      } else keep.push(p);
    });
    S.parked = keep;
    if (moved) { S.done = false; S.joins = S.joins || {}; }
    return moved;
  }
  function resumeApproval(S, nodeId, tokenId, decision) {
    var hit = null, keep = [];
    (S.parked || []).forEach(function (p) { if (!hit && p.kind === 'approval' && p.nodeId === nodeId && (!tokenId || p.token.id === tokenId)) hit = p; else keep.push(p); });
    if (!hit) return false;
    S.parked = keep;
    var next = decision === 'approve' || decision === 'approved' ? (hit.onApprove || []) : (hit.onReject || []);
    if (!next.length && !(decision === 'approve' || decision === 'approved')) S.stuck.push({ wfId: hit.wfId, nodeId: nodeId, reason: 'approval rejected' });
    next.forEach(function (x) { S.tokens.push(x); });
    S.done = false;
    return true;
  }
  function isWaiting(S) { return (S.parked || []).length > 0; }
  function nm(S, ctx, x) { var f = flowOf(ctx, x.wfId || S.wfId); var n = f && x.nodeId ? byId(f.nodes, x.nodeId) : null; return '“' + (n ? nodeTitle(n) : 'flow') + '”' + ((f && f.id !== S.wfId) ? ' in “' + f.name + '”' : ''); }
  function summary(S, ctx) {
    if (S.noFire && !S.log.length) return { ok: false, text: 'Trigger would not fire — ' + S.noFire };
    var parts = [];
    if (S.ends.length) parts.push('Ended at ' + Array.from(new Set(S.ends.map(function (e) { var f = (e.wfId && e.wfId !== S.wfId) ? flowOf(ctx, e.wfId) : null; return '“' + e.outcome + '”' + ((e.wfId && e.wfId !== S.wfId) ? ' in “' + ((f || {}).name || '?') + '”' : ''); }))).join(' + '));
    S.atStep.forEach(function (a) { parts.push('Waiting at step ' + nm(S, ctx, a) + ' (' + a.reason + ')'); });
    S.stuck.forEach(function (s) { parts.push((s.waiting ? 'Waiting at ' : 'Stuck at ') + nm(S, ctx, s) + ' — ' + s.reason); });
    (S.parked || []).filter(function (p) { return p.kind === 'approval'; }).forEach(function (p) { parts.push('Waiting for approval at ' + nm(S, ctx, p)); });
    if (!S.done) parts.push('In progress…');
    var waiting = S.stuck.some(function (s) { return s.waiting; }) || S.atStep.length > 0 || (S.parked || []).some(function (p) { return p.kind === 'approval'; });
    return { ok: S.done && !S.stuck.some(function (s) { return !s.waiting; }), waiting: waiting, text: Array.from(new Set(parts)).join(' · ') || 'Nothing ran.' };
  }
  function category(S, ctx) {
    if (S.noFire && !S.log.length) return 'Trigger would not fire';
    var keys = [];
    S.ends.forEach(function (e) { var f = (e.wfId && e.wfId !== S.wfId) ? flowOf(ctx, e.wfId) : null; keys.push('Ended: ' + e.outcome + ((e.wfId && e.wfId !== S.wfId) ? ' (in “' + ((f || {}).name || '?') + '”)' : '')); });
    S.atStep.forEach(function (a) { keys.push('At step: ' + nm(S, ctx, a).replace(/[“”]/g, '')); });
    S.stuck.forEach(function (s) { keys.push((s.waiting ? 'Waiting at: ' : 'Stuck at: ') + nm(S, ctx, s).replace(/[“”]/g, '')); });
    return Array.from(new Set(keys)).join(' + ') || 'Nothing ran';
  }
  /* strip caches / the record before storing a run's state */
  function serialize(S) { var o = {}; for (var k in S) if (k !== 'backBy' && k !== 'm') o[k] = S[k]; return JSON.parse(JSON.stringify(o)); }
  /* A legacy Automation rule (camelCase fields, as Schema.html loads them) as a bundle's action list.
     resolveTargets(type, ids) -> user ids (null for everyone); used to turn the rule's implicit email into recipients. */
  function automationActions(a, resolveTargets) {
    var msg = a.actionMessage || ('"' + a.name + '" matched: {{name}}');
    if (a.actionType !== 'alert_people') return [{ type: 'note', message: msg }];
    var tt = a.actionTargetType || 'org', acts = [{ type: 'alert', targetType: tt === 'manager' ? 'org' : tt, targetIds: (a.actionTargetIds || []).slice(), message: msg }];
    if (tt !== 'org' && tt !== 'manager' && resolveTargets) { var ids = resolveTargets({ actionTargetType: tt, actionTargetIds: a.actionTargetIds || [] }) || []; if (ids.length) acts.push({ type: 'email', recipientIds: ids, subject: a.name, body: msg }); }
    if (a.actionChatDestId) acts.push({ type: 'chat', destId: a.actionChatDestId, message: msg });
    if (a.actionTargetAgent) acts.push({ type: 'agent', mode: 'push', destId: '', brief: 'Summarise the status of {{name}} ({{step}}, {{value}}) and suggest a next step.', intoField: '' });
    return acts;
  }
  function periodKey(freq, now) {
    var d = new Date(now == null ? Date.now() : now);
    if (freq === 'hourly') return 'hr:' + d.toISOString().slice(0, 13);
    if (freq === 'weekly') {
      var u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); var dn = (u.getUTCDay() + 6) % 7; u.setUTCDate(u.getUTCDate() - dn + 3);
      var ft = new Date(Date.UTC(u.getUTCFullYear(), 0, 4)); var wk = 1 + Math.round(((u - ft) / DAY - 3 + ((ft.getUTCDay() + 6) % 7)) / 7);
      return 'wk:' + u.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
    }
    return 'day:' + d.toISOString().slice(0, 10);
  }

  return {
    VERSION: VERSION, KINDS: KINDS, ACTION_LABELS: ACTION_LABELS, OPS: OPS, PROCESSES: PROCESSES,
    processesForTable: processesForTable, stepOf: stepOf, normalize: normalize, assetStep: assetStep,
    daysSince: daysSince, fill: fill, fillAction: fillAction, condHolds: condHolds, thresholdHolds: thresholdHolds,
    unitText: unitText, daysToCal: daysToCal, needsApproval: needsApproval,
    kindOf: kindOf, nodeTitle: nodeTitle, out: out, inc: inc, triggers: triggers, backEdges: backEdges, reach: reach,
    boundKey: boundKey, handoffOf: handoffOf,
    triggerFires: triggerFires, eventMatches: eventMatches, ruleFires: ruleFires, ruleEventMatches: ruleEventMatches, ruleToFlow: ruleToFlow,
    evalCondition: evalCondition, eventHappened: eventHappened,
    initRun: initRun, step: step, run: run, resume: resume, resumeApproval: resumeApproval, isWaiting: isWaiting,
    summary: summary, category: category, serialize: serialize, periodKey: periodKey, automationActions: automationActions
  };
});
