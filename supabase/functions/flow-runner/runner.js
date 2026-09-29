// flow-runner core (2026-09-29, Stef: "complete phases 2b and 3").
// Plain ES module with no Deno- or Node-only APIs, so the SAME file runs inside the Edge Function
// (index.ts) and in the Node test harness. Everything it touches comes in through `deps`:
//   deps.db     a supabase-js client created with the SERVICE ROLE key (bypasses RLS)
//   deps.fetch  fetch()        deps.now  () => ms        deps.crypto  WebCrypto (globalThis.crypto)
//   deps.log    (optional) console-like logger
// The flow semantics live in ./flowEngine.js (a byte-identical copy of Northm/shared/flowEngine.js).
import * as FEmod from './flowEngine.js';
const FE = (globalThis.FlowEngine) || (FEmod && (FEmod.default || FEmod));

const DAY = 86400000;
const MAX_ACTIONS_PER_FLOW_PER_HOUR = 200;
const RETRY_BACKOFF_MIN = [1, 5, 15];
const EVENT_BATCH = 200, RUN_BATCH = 50;
/* Fields a flow may write (Calculate / pull "write result to field"). Anything else is refused. */
export const WRITABLE_FIELDS = {
  campaigns: ['budget', 'committed', 'alert_threshold_pct', 'notes'],
  augur_deals: ['value', 'notes'],
  eventus_events: ['budget', 'notes'],
  tasks: ['notes', 'due_date', 'status'],
  assets: ['stock', 'low_stock_at', 'notes'],
  prospectus_leads: ['notes', 'status'],
};

const iso = (ms) => new Date(ms).toISOString();
/* the UI stores connector parameters as p_<name> keys (so placeholders in them get filled like any other field) */
function paramsOf(a) { const o = {}; Object.keys(a || {}).forEach((k) => { if (k.indexOf('p_') === 0) o[k.slice(2)] = a[k]; }); return o; }
function headersOf(h) { if (!h) return {}; if (typeof h === 'object') return h; try { const o = JSON.parse(h); return (o && typeof o === 'object') ? o : {}; } catch (_) { return {}; } }
const tsText = (ms) => iso(ms).slice(0, 16).replace('T', ' ');
function hex(buf) { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
export async function sha256Hex(crypto, text) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
export async function hmacHex(crypto, secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}
export function randomToken(crypto) { const b = new Uint8Array(24); crypto.getRandomValues(b); return hex(b); }
export function safeEqual(a, b) { a = String(a || ''); b = String(b || ''); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
/* the flow meta lives in schema_workflows.flow, or (before that migration) in a hidden '__flow__' node */
export function hydrateFlow(row) {
  const nodes = (row.nodes || []).filter((n) => n && n.id !== '__flow__');
  const meta = row.flow || ((row.nodes || []).find((n) => n && n.id === '__flow__') || {}).config || null;
  return { id: row.id, org_id: row.org_id, name: row.name, nodes, edges: row.edges || [], flow: meta };
}
export function calcValue(expr, rec) {
  let e = String(expr || '').trim().replace(/^=/, '');
  if (!e) return { ok: false, error: 'no expression' };
  const vars = Object.assign({}, rec.fields || {}, { value: rec.value });
  let bad = null;
  e = e.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (k) => { const n = Number(vars[k]); if (vars[k] === null || vars[k] === undefined || vars[k] === '' || isNaN(n)) { bad = k; return '0'; } return '(' + n + ')'; });
  if (bad) return { ok: false, error: 'unknown or non-numeric field "' + bad + '"' };
  if (!/^[0-9+\-*/().\s]+$/.test(e)) return { ok: false, error: 'only + - * / and brackets are allowed' };
  try { const v = Function('"use strict";return (' + e + ')')(); return (typeof v === 'number' && isFinite(v)) ? { ok: true, value: Math.round(v * 100) / 100 } : { ok: false, error: 'not a number' }; }
  catch (_) { return { ok: false, error: 'could not evaluate' }; }
}

export async function tick(env, deps) {
  const db = deps.db, now = deps.now ? deps.now() : Date.now(), crypto = deps.crypto || globalThis.crypto;
  const log = deps.log || { warn() {}, error() {}, info() {} };
  const budgetEnd = (deps.clock ? deps.clock() : Date.now()) + (env.BUDGET_MS || 25000);
  const inBudget = () => (deps.clock ? deps.clock() : Date.now()) < budgetEnd;
  const stats = { claimed: 0, runsCreated: 0, runsAdvanced: 0, actions: 0, dispatched: 0, approvals: 0, failures: 0, watches: 0, paused: [], errors: [] };
  const HUB = String(env.HUB_URL || 'https://hub-backend-psi.vercel.app').replace(/\/+$/, '');
  const NORTH = String(env.NORTH_URL || 'https://northm.vercel.app/').replace(/\/?$/, '/');
  const FN_BASE = String(env.SUPABASE_URL || '').replace(/\/+$/, '') + '/functions/v1';
  const q = async (p, what) => { const r = await p; if (r && r.error) { stats.errors.push(what + ': ' + (r.error.message || r.error)); log.warn(what, r.error); } return r || {}; };

  /* ---------- world: flows, orgs, people (cached per tick) ---------- */
  const wfRes = await q(db.from('schema_workflows').select('id,org_id,name,nodes,edges,flow'), 'load flows');
  const flows = {}; (wfRes.data || []).forEach((r) => { const f = hydrateFlow(r); flows[f.id] = f; });
  const isActive = (f) => !!(f && f.flow && f.flow.kind === 'flow' && f.flow.status === 'active');
  const ruleFlows = {};
  const orgCache = {};
  async function org(orgId) {
    if (orgCache[orgId]) return orgCache[orgId];
    const o = { id: orgId, rows: {}, slug: '' };
    const [or, pr, tr, br, dr, bu, st, wa, au] = await Promise.all([
      q(db.from('organizations').select('id,hub_org_slug').eq('id', orgId).maybeSingle(), 'org'),
      q(db.from('profiles').select('id,name,email,region_ids,cross_region,org_id').eq('org_id', orgId), 'profiles'),
      q(db.from('teams').select('id,member_ids,unit_ids').eq('org_id', orgId), 'teams'),
      q(db.from('business_units').select('id,member_ids,manager_id').eq('org_id', orgId), 'units'),
      q(db.from('agent_destinations').select('id,name,type,target,is_org_default').eq('org_id', orgId), 'destinations'),
      q(db.from('automation_bundles').select('id,name,actions').eq('org_id', orgId), 'bundles'),
      q(db.from('system_triggers').select('id,process_key,step,rule,enabled').eq('org_id', orgId), 'system triggers'),
      q(db.from('flow_watches').select('*').eq('org_id', orgId).eq('enabled', true), 'watches'),
      q(db.from('schema_automations').select('id,name,action_type,action_message,action_target_type,action_target_ids,action_chat_dest_id,action_target_agent').eq('org_id', orgId), 'automations'),
    ]);
    o.autos = (au.data || []).map((a) => ({ id: a.id, name: a.name || '', actionType: a.action_type, actionMessage: a.action_message || '', actionTargetType: a.action_target_type || 'org', actionTargetIds: a.action_target_ids || [], actionChatDestId: a.action_chat_dest_id || '', actionTargetAgent: !!a.action_target_agent }));
    o.slug = (or.data && or.data.hub_org_slug) || '';
    o.people = pr.data || []; o.teams = tr.data || []; o.units = br.data || []; o.dests = dr.data || [];
    o.bundles = bu.data || []; o.watches = wa.data || [];
    o.rules = (st.data || []).map((r) => Object.assign({}, r.rule || {}, { id: r.id, procKey: r.process_key, step: r.step, enabled: r.enabled !== false }));
    o.rules.forEach((r) => { ruleFlows['rule:' + r.id] = FE.ruleToFlow(r); });
    orgCache[orgId] = o; return o;
  }
  async function rowsOf(o, table) {
    if (!table) return [];
    if (!o.rows[table]) { const r = await q(db.from(table).select('*').eq('org_id', o.id).limit(2000), 'rows ' + table); o.rows[table] = r.data || []; }
    return o.rows[table];
  }
  function ctxFor(o, rec) {
    return {
      now, mode: 'run', record: rec,
      flowById: (id) => flows[id] || ruleFlows[id] || null,
      bundleByRef: (ref) => {
        const [kind, id] = String(ref || '').split(':');
        if (kind === 'lib' || kind === 'db') { const b = o.bundles.find((x) => x.id === id); return b ? { name: b.name, actions: b.actions || [] } : null; }
        if (kind === 'auto') { const a = (o.autos || []).find((x) => x.id === id); return a ? { name: a.name, actions: FE.automationActions(a, (t) => resolveTargets(o, t.actionTargetType, t.actionTargetIds)) } : null; }
        return null;
      },
      ruleById: (id) => o.rules.find((r) => r.id === id) || null,
      userName: (id) => (o.people.find((p) => p.id === id) || {}).name || '',
      link: (page) => NORTH + page,
      rowsOf: (t) => o.rows[t] || [],
    };
  }
  async function loadRecord(o, procKey, id) {
    const P = FE.PROCESSES[procKey]; if (!P || !P.table || id == null) return null;
    if (procKey === 'lead') await rowsOf(o, 'augur_deals');
    const r = await q(db.from(P.table).select('*').eq('id', id).maybeSingle(), 'record');
    return r.data ? FE.normalize(procKey, r.data, ctxFor(o, null)) : null;
  }
  function resolveTargets(o, type, ids) {
    type = type || 'org'; ids = ids || [];
    if (type === 'org') return null;
    if (type === 'users') return ids.slice();
    if (type === 'regions') return o.people.filter((u) => u.cross_region || (u.region_ids || []).some((r) => ids.includes(r))).map((u) => u.id);
    if (type === 'teams') {
      const s = new Set();
      o.teams.filter((t) => ids.includes(t.id)).forEach((t) => { (t.member_ids || []).forEach((x) => s.add(x)); (t.unit_ids || []).forEach((uid) => { const u = o.units.find((z) => z.id === uid); if (u) (u.member_ids || []).forEach((x) => s.add(x)); }); });
      return Array.from(s);
    }
    return null;
  }
  async function audit(o, what, detail, targets) {
    await q(db.from('audit_log').insert({ id: crypto.randomUUID(), org_id: o.id, ts: tsText(now), what: String(what).slice(0, 200), detail: String(detail || '').slice(0, 2000), user_id: null, target_user_ids: targets && targets.length ? targets : null }), 'audit');
  }

  /* ---------- Hub dispatch (HMAC per FLOW_CONTRACT.md) ---------- */
  async function dispatch(o, run, nodeId, attempt, rec, action) {
    if (!env.FLOW_DISPATCH_SECRET) return { ok: false, error: 'FLOW_DISPATCH_SECRET is not set', retryable: false };
    const body = JSON.stringify({ org_id: o.id, hub_org_slug: o.slug || '', run_id: run.id, node_id: nodeId, idempotency_key: run.id + ':' + nodeId + ':' + attempt,
      record: rec ? { type: rec.type || 'none', id: rec.id == null ? null : String(rec.id), name: rec.name || '', fields: rec.fields || {} } : { type: 'none', id: null, name: '', fields: {} }, action });
    const ts = String(Math.floor(now / 1000));
    const sig = await hmacHex(crypto, env.FLOW_DISPATCH_SECRET, ts + '.' + body);
    stats.dispatched++;
    try {
      const res = await deps.fetch(HUB + '/flows/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Flow-Timestamp': ts, 'X-Flow-Signature': sig }, body });
      let j = null; try { j = await res.json(); } catch (_) { j = null; }
      if (j && j.ok) return { ok: true, result: j.result || {} };
      if (j && j.ok === false) return { ok: false, error: j.error || ('HTTP ' + res.status), retryable: !!j.retryable };
      return { ok: false, error: 'Hub returned HTTP ' + res.status, retryable: res.status >= 500 || res.status === 429 };
    } catch (e) { return { ok: false, error: 'Hub unreachable: ' + (e && e.message || e), retryable: true }; }
  }
  async function writeField(o, rec, field, value) {
    const P = FE.PROCESSES[rec.procKey || ''] || {};
    const table = P.table;
    if (!table || !(WRITABLE_FIELDS[table] || []).includes(field)) return { ok: false, error: 'field "' + field + '" is not writable by flows', retryable: false };
    const r = await q(db.from(table).update({ [field]: value }).eq('id', rec.id).eq('org_id', o.id).select('id'), 'write field');
    if (r.error) return { ok: false, error: 'could not write ' + field, retryable: true };
    return { ok: true, result: { status: 'done', detail: 'Set ' + field + ' = ' + value } };
  }

  /* ---------- actions ---------- */
  async function execute(o, flow, run, rec, act, attempt) {
    const a = FE.fillAction(act.action, rec || {});
    const t = a.type, name = flow ? flow.name : 'Flow';
    stats.actions++;
    if (t === 'note') { await audit(o, 'flow: ' + name, a.message || ('"' + name + '" ran for ' + (rec ? rec.name : 'a record'))); return { ok: true, result: { status: 'done', detail: 'Note logged' } }; }
    if (t === 'alert') { const ids = resolveTargets(o, a.targetType, a.targetIds); await audit(o, '🔔 flow alert: ' + name, a.message || name, ids); return { ok: true, result: { status: 'sent', detail: 'Alert to ' + (ids ? ids.length + ' people' : 'everyone') } }; }
    if (t === 'email') {
      const to = o.people.filter((p) => (a.recipientIds || []).includes(p.id) && p.email).map((p) => ({ email: p.email, name: p.name }));
      if (!to.length) return { ok: false, error: 'no recipients with an email address', retryable: false };
      return dispatch(o, run, act.nodeId, attempt, rec, { type: 'email', config: { to, subject: a.subject || name, body: a.body || '' } });
    }
    if (t === 'task') {
      let owner = a.ownerId || ''; const p = o.people.find((x) => x.id === owner); if (p) owner = p.name;
      const due = iso(now + (Number(a.dueDays) || 0) * DAY).slice(0, 10);
      const row = { id: crypto.randomUUID(), org_id: o.id, name: a.title || 'Follow up', owner, due_date: due, status: 'Planned', notes: 'Created by flow "' + name + '"' };
      if (rec && rec.type === 'campaign') row.campaign_id = rec.id;
      const r = await q(db.from('tasks').insert(row).select('id'), 'task');
      return r.error ? { ok: false, error: 'could not create the task', retryable: true } : { ok: true, result: { status: 'done', detail: 'Task "' + row.name + '" due ' + due, external_id: row.id } };
    }
    if (t === 'escalate') {
      await q(db.from('flow_waits').insert({ org_id: o.id, run_id: run.id, node_id: act.nodeId, due_at: iso(now + (Number(a.days) || 0) * DAY), until: { kind: 'escalate', action: a, step: rec ? rec.step : null, record_id: rec ? rec.id : null, procKey: rec ? rec.procKey : null }, done: false }), 'escalation wait');
      return { ok: true, result: { status: 'done', detail: 'Escalation scheduled in ' + (a.days || 0) + ' days' } };
    }
    if (t === 'calc') { const v = calcValue(a.expr, rec || {}); if (!v.ok) return { ok: false, error: v.error, retryable: false }; return writeField(o, rec || {}, a.field, v.value); }
    if (t === 'webhook') return dispatch(o, run, act.nodeId, attempt, rec, { type: 'webhook', config: { url: a.url, method: a.method || 'POST', headers: headersOf(a.headers), body: a.body || '' } });
    if (t === 'chat') {
      const d = o.dests.find((x) => x.id === a.destId);
      if (!d || !d.target) return { ok: false, error: 'chat destination not found', retryable: false };
      return dispatch(o, run, act.nodeId, attempt, rec, { type: 'chat', config: { kind: d.type === 'teams_webhook' ? 'teams' : 'slack', webhook_url: d.target, title: name, text: a.message || '' } });
    }
    let r = null;
    if (t === 'http_pull') r = await dispatch(o, run, act.nodeId, attempt, rec, { type: 'http_pull', config: { url: a.url, method: a.method || 'GET', headers: headersOf(a.headers), body: a.body || '', extract: a.extract || '' } });
    else if (t === 'connector') r = await dispatch(o, run, act.nodeId, attempt, rec, { type: 'connector', config: { connector_key: a.connectorKey || '', operation: a.operation || '', params: a.params || paramsOf(a) } });
    else if (t === 'agent') {
      const d = o.dests.find((x) => x.id === a.destId); const agent = a.agent || (d ? d.name : '');
      r = a.mode === 'pull'
        ? await dispatch(o, run, act.nodeId, attempt, rec, { type: 'agent_pull', config: { agent, prompt: a.brief || '', context: rec ? rec.fields : {} } })
        : await dispatch(o, run, act.nodeId, attempt, rec, { type: 'agent_push', config: { agent, brief: a.brief || '' } });
    } else return { ok: false, error: 'unknown action type ' + t, retryable: false };
    if (r.ok && a.intoField && rec && r.result && r.result.value !== undefined && (t !== 'agent' || a.mode === 'pull')) {
      const w = await writeField(o, rec, a.intoField, r.result.value);
      if (!w.ok) return w;
      r.result.detail = (r.result.detail || 'Done') + ' · ' + w.result.detail;
    }
    return r;
  }
  async function stepRow(o, run, nodeId, kind, outcome, detail) {
    await q(db.from('flow_run_steps').insert({ org_id: o.id, run_id: run.id, flow_id: run.flow_id, node_id: nodeId || null, kind, outcome, detail: String(detail || '').slice(0, 2000), at: iso(now) }), 'step');
  }
  const actionCount = {};
  async function underLimit(o, flowId, n) {
    if (actionCount[flowId] == null) {
      const r = await q(db.from('flow_run_steps').select('id', { count: 'exact', head: true }).eq('flow_id', flowId).eq('kind', 'action').gte('at', iso(now - 3600000)), 'rate');
      actionCount[flowId] = r.count || 0;
    }
    if (actionCount[flowId] + n > MAX_ACTIONS_PER_FLOW_PER_HOUR) {
      const f = flows[flowId];
      if (f && f.flow && f.flow.status === 'active') {
        f.flow.status = 'paused'; f.flow.pausedReason = 'Paused automatically: more than ' + MAX_ACTIONS_PER_FLOW_PER_HOUR + ' actions in an hour (' + iso(now) + ').';
        await q(db.from('schema_workflows').update({ flow: f.flow }).eq('id', flowId), 'pause flow');
        await audit(o, 'flow paused: ' + f.name, f.flow.pausedReason);
        stats.paused.push(flowId);
      }
      return false;
    }
    actionCount[flowId] += n; return true;
  }
  async function createApproval(o, flow, run, rec, act) {
    const token = randomToken(crypto), hash = await sha256Hex(crypto, token), id = crypto.randomUUID();
    const filled = FE.fillAction(act.action, rec || {});
    await q(db.from('flow_approvals').insert({ id, org_id: o.id, run_id: run.id, node_id: act.nodeId, action: { nodeId: act.nodeId, tokenId: act.tokenId, action: act.action, preview: filled, record: rec ? { id: rec.id, name: rec.name, procKey: rec.procKey } : null }, status: 'pending', token_hash: hash }), 'approval');
    stats.approvals++;
    const approverIds = (act.action.approverIds && act.action.approverIds.length) ? act.action.approverIds : [flow && flow.flow && flow.flow.owner_id].filter(Boolean);
    const to = o.people.filter((p) => approverIds.includes(p.id) && p.email).map((p) => ({ email: p.email, name: p.name }));
    const link = (d) => FN_BASE + '/flow-approve?id=' + id + '&token=' + token + '&decision=' + d;
    const what = (FE.ACTION_LABELS[filled.type] || filled.type) + (filled.field ? ' → ' + filled.field : filled.intoField ? ' → ' + filled.intoField : '');
    await audit(o, '✋ approval needed: ' + (flow ? flow.name : 'flow'), what + ' for ' + (rec ? rec.name : 'a record') + ' — approve in Process Maps → Runs & approvals', approverIds.length ? approverIds : null);
    if (to.length) await dispatch(o, run, act.nodeId + ':approval', 1, rec, { type: 'email', config: { to, subject: 'Approval needed: ' + (flow ? flow.name : 'flow'),
      body: 'The flow "' + (flow ? flow.name : '') + '" wants to: ' + what + ' for ' + (rec ? rec.name : 'a record') + '.\n\nApprove: ' + link('approve') + '\nReject: ' + link('reject') + '\n\nOr open Process Maps → Runs & approvals in North.' } });
    return id;
  }
  async function notifyWatch(o, w, text) {
    stats.watches++;
    await audit(o, '👁 Watch', text, [w.user_id]);
    const ch = w.channels || {};
    if (ch.email) { const p = o.people.find((x) => x.id === w.user_id); if (p && p.email) await dispatch(o, { id: 'watch-' + w.id }, 'watch:' + iso(now), 1, null, { type: 'email', config: { to: [{ email: p.email, name: p.name }], subject: 'North watch', body: text } }); }
  }

  /* ---------- runs ---------- */
  const runsLoaded = {};
  async function newRun(o, flow, startNodeIds, rec, dedupe, why, procKey) {
    const id = crypto.randomUUID();
    const ins = await db.from('flow_runs').insert({ id, org_id: o.id, flow_id: flow.id, record_type: rec ? (rec.type || 'none') : 'none', record_id: rec && rec.id != null ? String(rec.id) : null, status: 'running', current_nodes: startNodeIds, state: null, dedupe_key: dedupe, started_at: iso(now), updated_at: iso(now), next_check_at: iso(now), trigger_node: startNodeIds[0] || null });
    if (ins && ins.error) { if (String(ins.error.code) === '23505' || /duplicate/i.test(ins.error.message || '')) return null; stats.errors.push('create run: ' + ins.error.message); return null; }
    stats.runsCreated++;
    const S = FE.initRun(flow, rec, { startNodeIds, why, startedAt: now }, ctxFor(o, rec));
    S.procKey = procKey || FE.boundKey(flow); S.recordSnap = rec && rec.type === 'inbound' ? rec : null;
    const run = { id, org_id: o.id, flow_id: flow.id, record_id: rec && rec.id != null ? String(rec.id) : null, status: 'running', state: S, started_at: iso(now) };
    runsLoaded[id] = run;
    await advance(o, run, { fresh: true, rec });
    return run;
  }
  async function advance(o, run, opts) {
    opts = opts || {};
    const flow = flows[run.flow_id] || ruleFlows[run.flow_id];
    if (!flow) { await q(db.from('flow_runs').update({ status: 'failed', error: 'flow not found', updated_at: iso(now) }).eq('id', run.id), 'run fail'); return; }
    const S = run.state; if (!S) return;
    const procKey = S.procKey || FE.boundKey(flow);
    let rec = opts.rec || S.recordSnap || (run.record_id ? await loadRecord(o, procKey, run.record_id) : null);
    if (rec) rec.procKey = procKey;
    const ctx = ctxFor(o, rec);
    S.ff = Math.max(0, (now - (S.startedAt || now)) / DAY);
    if (opts.resume) FE.resume(S, ctx);
    const before = (S.log || []).length;
    const acts = FE.run(S, ctx, 500);
    stats.runsAdvanced++;
    for (const e of (S.log || []).slice(before)) await stepRow(o, run, e.nodeId, e.kind || 'node', e.cls || 'ok', e.title + (e.lines && e.lines.length ? ' — ' + e.lines.join(' | ') : ''));
    S.log = (S.log || []).slice(-60); /* the step table is the full history; keep state small */
    S.failed = S.failed || [];
    let failed = null;
    const real = acts.filter((a) => a.action && a.action.type !== '__subflow');
    const okToRun = real.length ? await underLimit(o, flow.id, real.length) : true;
    for (const a of acts) {
      if (!inBudget()) { S.failed.push({ act: a, attempt: 1, error: 'deferred: tick time budget used up', retryable: true }); continue; }
      if (a.action.type === '__subflow') { const sf = flows[a.action.flowId]; if (sf) await newRun(o, sf, FE.triggers(sf).map((t) => t.id), rec, run.id + ':' + a.nodeId + ':subflow', 'started as a subflow of “' + flow.name + '”', procKey); continue; }
      if (!okToRun) { failed = 'flow paused: more than ' + MAX_ACTIONS_PER_FLOW_PER_HOUR + ' actions in an hour'; break; }
      if (a.approval) { await createApproval(o, flow, run, rec, a); await stepRow(o, run, a.nodeId, 'approval', 'pending', 'Approval requested: ' + (FE.ACTION_LABELS[a.action.type] || a.action.type)); continue; }
      const r = await execute(o, flow, run, rec, a, 1);
      await stepRow(o, run, a.nodeId, 'action', r.ok ? (r.result.status || 'done') : 'failed', (FE.ACTION_LABELS[a.action.type] || a.action.type) + ': ' + (r.ok ? (r.result.detail || 'done') : r.error));
      if (!r.ok) {
        stats.failures++;
        if (r.retryable) { await q(db.from('flow_waits').insert({ org_id: o.id, run_id: run.id, node_id: a.nodeId, due_at: iso(now + RETRY_BACKOFF_MIN[0] * 60000), until: { kind: 'retry', act: a, attempt: 2 }, done: false }), 'retry wait'); }
        else { failed = (FE.ACTION_LABELS[a.action.type] || a.action.type) + ' failed: ' + r.error; S.failed.push({ act: a, attempt: 1, error: r.error, retryable: false }); }
      }
    }
    await persist(o, run, flow, S, failed, rec);
  }
  async function persist(o, run, flow, S, failed, rec) {
    /* schedule the next re-check for parked waits */
    for (const p of (S.parked || [])) {
      if (p.kind === 'wait' && p.dueDay != null && !p.scheduled) {
        p.scheduled = true;
        await q(db.from('flow_waits').insert({ org_id: o.id, run_id: run.id, node_id: p.nodeId, due_at: iso((S.startedAt || now) + p.dueDay * DAY), until: { kind: 'wait', mode: p.until }, done: false }), 'wait');
      }
    }
    const hasAppr = (S.parked || []).some((p) => p.kind === 'approval');
    const status = failed ? 'failed' : hasAppr ? 'awaiting_approval' : (S.parked || []).length ? 'waiting' : (S.done ? 'done' : 'running');
    const cur = (S.tokens || []).map((t) => t.nodeId).concat((S.parked || []).map((p) => p.nodeId));
    await q(db.from('flow_runs').update({ status, state: FE.serialize(S), current_nodes: cur, updated_at: iso(now), error: failed || null, next_check_at: status === 'running' ? iso(now) : null }).eq('id', run.id), 'save run');
    const prev = run.status; run.status = status;
    if (prev !== status && (status === 'done' || status === 'failed' || status === 'awaiting_approval')) {
      const sum = FE.summary(S, ctxFor(o, rec)).text;
      for (const w of o.watches.filter((x) => x.target_type === 'flow' && x.target_id === run.flow_id)) await notifyWatch(o, w, (flow ? flow.name : 'Flow') + ' — ' + (rec ? rec.name + ': ' : '') + ({ done: 'finished', failed: 'failed', awaiting_approval: 'is waiting for approval' }[status]) + '. ' + sum);
      if (status === 'done' && !String(run.flow_id).startsWith('rule:')) {
        for (const f of Object.values(flows).filter((x) => x.org_id === o.id && isActive(x) && x.id !== run.flow_id)) {
          for (const t of FE.triggers(f).filter((t) => ((t.config || {}).when || {}).type === 'flow_finished' && t.config.when.flowId === run.flow_id)) {
            await newRun(o, f, [t.id], rec, f.id + ':' + t.id + ':after:' + run.id, 'after “' + (flow ? flow.name : '') + '” finished');
          }
        }
      }
    }
  }
  async function loadRun(id) {
    if (runsLoaded[id]) return runsLoaded[id];
    const r = await q(db.from('flow_runs').select('*').eq('id', id).maybeSingle(), 'load run');
    if (r.data) runsLoaded[id] = r.data;
    return r.data || null;
  }

  /* ---------- 1. events ---------- */
  const pend = await q(db.from('flow_events').select('id').is('processed_at', null).order('id', { ascending: true }).limit(EVENT_BATCH), 'pending events');
  const ids = (pend.data || []).map((e) => e.id);
  let claimed = [];
  if (ids.length) { const c = await q(db.from('flow_events').update({ processed_at: iso(now) }).in('id', ids).is('processed_at', null).select('*'), 'claim events'); claimed = c.data || []; }
  stats.claimed = claimed.length;
  const toResume = new Set();
  for (const ev of claimed) {
    if (!inBudget()) break;
    const o = await org(ev.org_id);
    if (ev.kind === 'inbound') {
      const f = flows[(ev.payload || {}).flow_id];
      if (!f || f.org_id !== ev.org_id || !isActive(f)) continue;
      const rec = { id: 'inbound:' + ev.id, type: 'inbound', name: 'Inbound webhook', step: '', stepLabel: '', fields: (ev.payload || {}).body || {}, value: '', owner: '', link: '' };
      const trig = FE.triggers(f).filter((t) => ((t.config || {}).when || {}).type === 'inbound');
      if (trig.length) await newRun(o, f, trig.map((t) => t.id), rec, f.id + ':inbound:' + ev.id, 'inbound webhook called', '');
      continue;
    }
    const keys = FE.processesForTable(ev.source_table);
    if (keys.includes('lead')) await rowsOf(o, 'augur_deals');
    for (const pk of keys) {
      const cx = ctxFor(o, null);
      const oldM = ev.old ? FE.normalize(pk, ev.old, cx) : null, newM = ev.new ? FE.normalize(pk, ev.new, cx) : null;
      if (!newM) continue;
      newM.procKey = pk;
      for (const f of Object.values(flows).filter((x) => x.org_id === ev.org_id && isActive(x) && FE.boundKey(x) === pk)) {
        for (const t of FE.triggers(f)) {
          if (!FE.eventMatches(t, oldM, newM, f)) continue;
          const wt = ((t.config || {}).when || {}).type;
          const key = wt === 'threshold' ? f.id + ':' + t.id + ':' + newM.id + ':thr:' + newM.step : f.id + ':' + t.id + ':' + newM.id + ':ev' + ev.id;
          await newRun(o, f, [t.id], newM, key, 'record entered “' + newM.stepLabel + '”', pk);
        }
      }
      for (const r of o.rules.filter((r) => r.enabled && r.procKey === pk)) {
        if (FE.ruleEventMatches(r, oldM, newM)) await newRun(o, ruleFlows['rule:' + r.id], [ruleFlows['rule:' + r.id].nodes[0].id], newM, 'rule:' + r.id + ':' + newM.id + ':ev' + ev.id, 'system trigger', pk);
      }
      for (const w of o.watches.filter((w) => w.target_type === 'process' && w.process_key === pk)) {
        const entered = w.step ? (newM.step === w.step && (!oldM || oldM.step !== w.step)) : (!!oldM && oldM.step !== newM.step);
        if (!entered) continue;
        if ((w.conditions || []).some((c) => c.field && !FE.condHolds(c, newM))) continue;
        await notifyWatch(o, w, newM.name + ' is now at “' + newM.stepLabel + '”' + (oldM ? ' (was “' + oldM.stepLabel + '”)' : '') + '.');
      }
    }
    /* a waiting run for this record may be able to move on (wait-until-event, record moved step) */
    const wr = await q(db.from('flow_runs').select('id').eq('org_id', ev.org_id).eq('record_id', String((ev.new || {}).id)).in('status', ['waiting']), 'waiting runs');
    (wr.data || []).forEach((r) => toResume.add(r.id));
  }

  /* ---------- 2. time-based triggers: time in step, thresholds, schedules ---------- */
  const tz = env.FLOW_TZ || 'Australia/Sydney';
  const hm = (() => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(now)); } catch (_) { return iso(now).slice(11, 16); } })();
  const timed = (wh) => wh && (wh.type === 'stuck' || wh.type === 'schedule' || wh.type === 'threshold');
  for (const f of Object.values(flows).filter(isActive)) {
    if (!inBudget()) break;
    const trigs = FE.triggers(f).filter((t) => timed((t.config || {}).when));
    if (!trigs.length) continue;
    const o = await org(f.org_id); const pk = FE.boundKey(f); const P = FE.PROCESSES[pk]; if (!P || !P.table) continue;
    if (pk === 'lead') await rowsOf(o, 'augur_deals');
    const recs = (await rowsOf(o, P.table)).map((r) => { const m = FE.normalize(pk, r, ctxFor(o, null)); m.procKey = pk; return m; });
    for (const t of trigs) {
      const wh = t.config.when;
      if (wh.type === 'schedule' && wh.freq !== 'hourly' && wh.time && hm < wh.time) continue;
      for (const m of recs) {
        if (!FE.triggerFires(t, m, f, ctxFor(o, m)).ok) continue;
        const key = wh.type === 'stuck' ? f.id + ':' + t.id + ':' + m.id + ':stuck:' + m.step + ':' + String(m.fields[wh.dateField] || '')
          : wh.type === 'threshold' ? f.id + ':' + t.id + ':' + m.id + ':thr:' + m.step
          : f.id + ':' + t.id + ':' + m.id + ':' + FE.periodKey(wh.freq, now);
        await newRun(o, f, [t.id], m, key, wh.type === 'schedule' ? 'scheduled run' : 'time-based trigger', pk);
        if (!inBudget()) break;
      }
    }
  }
  for (const oid of Object.keys(orgCache)) {   /* system triggers with time-based WHENs */
    const o = orgCache[oid];
    for (const r of o.rules.filter((r) => r.enabled && timed(r.when))) {
      if (!inBudget()) break;
      const P = FE.PROCESSES[r.procKey]; if (!P || !P.table) continue;
      if (r.when.type === 'schedule' && r.when.freq !== 'hourly' && r.when.time && hm < r.when.time) continue;
      for (const raw of await rowsOf(o, P.table)) {
        const m = FE.normalize(r.procKey, raw, ctxFor(o, null)); m.procKey = r.procKey;
        if (!FE.ruleFires(r, m, ctxFor(o, m)).ok) continue;
        const key = 'rule:' + r.id + ':' + m.id + ':' + (r.when.type === 'schedule' ? FE.periodKey(r.when.freq, now) : r.when.type + ':' + m.step + ':' + String(m.fields[r.when.dateField] || ''));
        await newRun(o, ruleFlows['rule:' + r.id], [ruleFlows['rule:' + r.id].nodes[0].id], m, key, 'system trigger', r.procKey);
      }
    }
  }

  /* ---------- 3. due waits: timeouts / durations, retries, escalations ---------- */
  const dueW = await q(db.from('flow_waits').select('id').eq('done', false).lte('due_at', iso(now)).order('due_at', { ascending: true }).limit(200), 'due waits');
  const wIds = (dueW.data || []).map((w) => w.id);
  if (wIds.length) {
    const cw = await q(db.from('flow_waits').update({ done: true }).in('id', wIds).eq('done', false).select('*'), 'claim waits');
    for (const w of (cw.data || [])) {
      if (!inBudget()) break;
      const u = w.until || {}; const run = await loadRun(w.run_id); if (!run) continue;
      const o = await org(run.org_id); const flow = flows[run.flow_id] || ruleFlows[run.flow_id];
      if (u.kind === 'escalate') {
        const rec = await loadRecord(o, u.procKey, u.record_id);
        if (rec && rec.step === u.step) {
          const ids2 = resolveTargets(o, u.action.targetType, u.action.targetIds);
          await audit(o, '⏫ flow escalation: ' + (flow ? flow.name : ''), u.action.message || (rec.name + ' is still at ' + rec.stepLabel), ids2);
          await stepRow(o, run, w.node_id, 'action', 'sent', 'Escalated: ' + rec.name + ' still at “' + rec.stepLabel + '”');
        } else await stepRow(o, run, w.node_id, 'action', 'skipped', 'Escalation not needed — the record moved on');
      } else if (u.kind === 'retry') {
        const rec = run.record_id ? await loadRecord(o, (run.state || {}).procKey, run.record_id) : null; if (rec) rec.procKey = (run.state || {}).procKey;
        const r = await execute(o, flow, run, rec, u.act, u.attempt);
        await stepRow(o, run, w.node_id, 'action', r.ok ? 'sent' : 'failed', 'Retry ' + u.attempt + ': ' + (r.ok ? r.result.detail : r.error));
        if (!r.ok) {
          if (r.retryable && u.attempt < 3) await q(db.from('flow_waits').insert({ org_id: o.id, run_id: run.id, node_id: w.node_id, due_at: iso(now + RETRY_BACKOFF_MIN[u.attempt - 1] * 60000), until: { kind: 'retry', act: u.act, attempt: u.attempt + 1 }, done: false }), 'retry wait');
          else { const S = run.state || {}; S.failed = (S.failed || []).concat([{ act: u.act, attempt: u.attempt, error: r.error, retryable: false }]); await q(db.from('flow_runs').update({ status: 'failed', error: 'Action failed after ' + u.attempt + ' tries: ' + r.error, state: S, updated_at: iso(now) }).eq('id', run.id), 'fail run'); }
        }
      } else toResume.add(run.id);
    }
  }

  /* ---------- 4. decided approvals ---------- */
  const dec = await q(db.from('flow_approvals').select('*').in('status', ['approved', 'rejected']).is('applied_at', null).limit(100), 'decided approvals');
  for (const ap of (dec.data || [])) {
    if (!inBudget()) break;
    const mark = await q(db.from('flow_approvals').update({ applied_at: iso(now) }).eq('id', ap.id).is('applied_at', null).select('id'), 'claim approval');
    if (!(mark.data || []).length) continue;
    const run = await loadRun(ap.run_id); if (!run || !run.state) continue;
    const o = await org(run.org_id); const flow = flows[run.flow_id] || ruleFlows[run.flow_id];
    const A = ap.action || {}; const rec = run.record_id ? await loadRecord(o, run.state.procKey, run.record_id) : (run.state.recordSnap || null); if (rec) rec.procKey = run.state.procKey;
    if (ap.status === 'approved') {
      const r = await execute(o, flow, run, rec, { nodeId: ap.node_id, action: A.action || {} }, 1);
      await stepRow(o, run, ap.node_id, 'action', r.ok ? 'sent' : 'failed', 'Approved → ' + (FE.ACTION_LABELS[(A.action || {}).type] || 'action') + ': ' + (r.ok ? r.result.detail : r.error));
    } else await stepRow(o, run, ap.node_id, 'approval', 'rejected', 'Rejected — action not run');
    const still = await q(db.from('flow_approvals').select('id').eq('run_id', run.id).eq('node_id', ap.node_id).eq('status', 'pending'), 'pending approvals');
    if ((still.data || []).length) continue;
    FE.resumeApproval(run.state, ap.node_id, A.tokenId || null, ap.status === 'approved' ? 'approve' : 'reject');
    run.status = 'running';
    await advance(o, run, { rec });
  }

  /* ---------- 5. runs to (re)advance: waiting runs woken above, plus 'running' ones (e.g. Retry from the UI) ---------- */
  const rr = await q(db.from('flow_runs').select('id').eq('status', 'running').lte('next_check_at', iso(now)).limit(RUN_BATCH), 'running runs');
  (rr.data || []).forEach((r) => { if (!runsLoaded[r.id]) toResume.add(r.id); });
  for (const id of toResume) {
    if (!inBudget()) break;
    const run = await loadRun(id); if (!run || !run.state || ['done', 'cancelled', 'awaiting_approval'].includes(run.status)) continue;
    const o = await org(run.org_id);
    const S = run.state;
    if (run.status === 'running' && (S.failed || []).length) {   /* Retry pressed on a failed run */
      const flow = flows[run.flow_id] || ruleFlows[run.flow_id];
      const rec = run.record_id ? await loadRecord(o, S.procKey, run.record_id) : null; if (rec) rec.procKey = S.procKey;
      const again = S.failed; S.failed = [];
      for (const f of again) { const r = await execute(o, flow, run, rec, f.act, (f.attempt || 1) + 1); await stepRow(o, run, f.act.nodeId, 'action', r.ok ? 'sent' : 'failed', 'Retry: ' + (r.ok ? r.result.detail : r.error)); if (!r.ok) S.failed.push({ act: f.act, attempt: (f.attempt || 1) + 1, error: r.error }); }
      if (S.failed.length) { await q(db.from('flow_runs').update({ status: 'failed', error: 'Retry failed: ' + S.failed[0].error, state: S, updated_at: iso(now) }).eq('id', run.id), 'retry fail'); continue; }
    }
    await advance(o, run, { resume: true });
  }
  return stats;
}
