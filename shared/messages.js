/* shared/messages.js (2026-10-15)
   Stef: "when a Task / alert / note / deadline is set or waiting for a person they should receive a message (Email / Slack ...
   whatever comms is set up). There should also be a Messages function in the top menu of all modules that alerts there is a
   message .. you can click on it, see all messages, then respond, mark as read, actioned etc ... time stamped."

   Drop-in for every module (needs the page's own `sb`, `_myProfile`, `_orgId` globals and a #tnAcct element in the top bar):
     - ✉ button in the top bar with an unread count (live via realtime when enabled, else checked every 60 s)
     - panel: Unread / All / Actioned / Archived, Sent, New message, My settings (where copies go: email, Slack, SMS ...)
     - per message: open the linked record, Reply (with screenshots / video), Mark read / unread, Actioned, Archive; all time stamped
     - @mentions: typing "@Full Name" in any notes / text field and leaving it sends that person a message (once per text)
     - once a day per person: due / overdue activities and campaigns ending soon (generate_my_deadline_messages)
     - after anything is sent, nudges the message-dispatch function so email / Slack / Teams / SMS / WhatsApp copies go out
   Database: Claude outputs/2026-10-15-migration-messages.sql. Before it is run the button stays hidden; nothing breaks.
   Public: window.NorthMessages = { open(tab), compose({to, title, body, kind, linkModule, linkRecord, linkLabel}), refresh(), send(opts) } */
(function () {
  'use strict';
  if (window.top !== window || window.NorthMessages) return;
  var BUCKET = 'message-attachments', MAX_FILE = 50 * 1024 * 1024;
  var KIND = { message: ['Message', '#45506B'], task: ['Task', '#1F3A68'], deadline: ['Deadline', '#B54708'], approval: ['Waiting on you', '#7C1F5A'],
    mention: ['Mention', '#0E6B3D'], issue: ['Issue', '#C0392B'], alert: ['Alert', '#B42318'], system: ['System', '#6B7489'] };
  var MODULE_URL = {
    CampaignPlanning: function (r) { return 'CampaignPlanning.html' + (r ? '#campaign=' + encodeURIComponent(r) : ''); },
    Configuration: function (r) { return 'Configuration.html' + (r ? '#feedback=' + encodeURIComponent(r) : ''); },
    Events: function (r) { return 'Events.html' + (r ? '#event=' + encodeURIComponent(r) : ''); }
  };
  var M = { ready: false, missing: false, unread: 0, list: [], tab: 'inbox', filter: 'unread', open: false, dir: null, prefs: null,
    compose: null, replyTo: null, files: [], busy: false, msg: '', chan: null, expanded: {} };

  function g(name) { try { return (0, eval)(name); } catch (e) { return undefined; } }   // page globals declared with let/const
  function S() { return g('sb'); }
  function me() { var p = g('_myProfile'); return p && p.id ? p : null; }
  function orgId() { var v = g('_savOrgFilter'); return (v !== undefined && v !== null) ? v : g('_orgId'); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { var t = g('toast'); if (typeof t === 'function') t(m); else console.log('[messages] ' + m); }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso), now = new Date(), t = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'Today ' + t;
    var y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Yesterday ' + t;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + ' ' + t;
  }
  function missingErr(e) { var c = e && (e.code || ''), m = String(e && e.message || ''); return c === '42P01' || c === 'PGRST205' || c === 'PGRST202' || /does not exist|schema cache/i.test(m); }
  function fnv(text) { var h = 0x811c9dc5; for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
  function linkUrl(m) {
    if (!m.link_module) return '';
    var f = MODULE_URL[m.link_module]; if (f) return f(m.link_record || '');
    return m.link_module.replace(/[^A-Za-z]/g, '') + '.html';
  }
  function dispatchSoon() {
    var s = S(); if (!s || !s.functions) return;
    setTimeout(function () { try { s.functions.invoke('message-dispatch', { body: { reason: 'new-message' } }).catch(function () {}); } catch (e) { /* not deployed yet */ } }, 400);
  }

  /* ---------------- data ---------------- */
  async function countUnread() {
    var s = S(), u = me(); if (!s || !u) return;
    var r = await s.from('user_messages').select('id', { count: 'exact', head: true }).eq('recipient_id', u.id).eq('status', 'unread');
    if (r.error) { if (missingErr(r.error)) { M.missing = true; paintBtn(); } return; }
    M.missing = false; M.unread = r.count || 0; paintBtn();
  }
  async function load() {
    var s = S(), u = me(); if (!s || !u) return;
    var q = s.from('user_messages').select('*').order('created_at', { ascending: false }).limit(200);
    if (M.tab === 'sent') q = q.eq('sender_id', u.id);
    else {
      q = q.eq('recipient_id', u.id);
      if (M.filter === 'unread') q = q.eq('status', 'unread');
      else if (M.filter === 'actioned') q = q.eq('status', 'actioned');
      else if (M.filter === 'archived') q = q.eq('status', 'archived');
      else q = q.neq('status', 'archived');
    }
    var r = await q;
    if (r.error) { M.msg = missingErr(r.error) ? 'Messages need the 2026-10-15 database update.' : r.error.message; M.list = []; }
    else { M.msg = ''; M.list = r.data || []; }
    paint();
  }
  async function directory() {
    if (M.dir) return M.dir; var s = S(); if (!s) return [];
    var r = await s.rpc('message_directory', { p_org: orgId() || null }); M.dir = r.error ? [] : (r.data || []); return M.dir;
  }
  async function setStatus(id, status) {
    var s = S(); var r = await s.from('user_messages').update({ status: status }).eq('id', id);
    if (r.error) { toast('Could not update the message: ' + r.error.message); return; }
    var m = M.list.filter(function (x) { return x.id === id; })[0]; if (m) m.status = status;
    if (M.tab === 'inbox' && M.filter !== 'all' && status !== M.filter) M.list = M.list.filter(function (x) { return x.id !== id; });
    countUnread(); paint();
  }
  async function uploadFiles(files) {
    var s = S(), out = [], o = orgId(), u = me();
    for (var i = 0; i < files.length; i++) {
      var f = files[i]; if (f.size > MAX_FILE) { toast(f.name + ' is over 50 MB and was left out.'); continue; }
      var path = o + '/' + u.id + '/' + Date.now() + '-' + f.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      var r = await s.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (r.error) { toast('Could not upload ' + f.name + ': ' + r.error.message); continue; }
      out.push({ path: path, name: f.name, size: f.size, type: f.type || '' });
    }
    return out;
  }
  async function send(o) {
    var s = S(); if (!s) throw new Error('not ready');
    var att = o.files && o.files.length ? await uploadFiles(o.files) : (o.attachments || []);
    var r = await s.rpc('send_message', { p_recipient: o.to, p_title: o.title || 'Message', p_body: o.body || '', p_kind: o.kind || 'message',
      p_link_module: o.linkModule || null, p_link_record: o.linkRecord || null, p_link_label: o.linkLabel || null, p_parent: o.parent || null,
      p_dedupe: o.dedupe || null, p_attachments: att });
    if (r.error) throw r.error;
    dispatchSoon(); return r.data;
  }
  async function openAttachment(path) {
    var s = S(); var r = await s.storage.from(BUCKET).createSignedUrl(path, 600);
    if (r.error || !r.data) { toast('Could not open the file: ' + ((r.error && r.error.message) || '')); return; }
    window.open(r.data.signedUrl, '_blank', 'noopener');
  }
  async function loadThread(m) {
    var root = m.thread_id || m.id, s = S();
    var r = await s.from('user_messages').select('*').or('id.eq.' + root + ',thread_id.eq.' + root).order('created_at', { ascending: true });
    M.expanded[m.id] = r.error ? [] : (r.data || []); paint();
  }
  async function loadPrefs() {
    var s = S(), u = me();
    var r = await s.from('message_prefs').select('*').eq('user_id', u.id).maybeSingle();
    M.prefs = r.data || { user_id: u.id, email: '', phone: '', slack_user_id: '', channels: { email: true }, muted_kinds: [] };
    var c = await s.from('message_channel_settings').select('channel,enabled,provider').eq('org_id', g('_orgId'));
    M.chan = c.error ? [] : (c.data || []); paint();
  }
  async function savePrefs() {
    var s = S(), p = M.prefs;
    var r = await s.from('message_prefs').upsert({ user_id: p.user_id, org_id: g('_orgId'), email: p.email || null, phone: p.phone || null, slack_user_id: p.slack_user_id || null,
      channels: p.channels || {}, muted_kinds: p.muted_kinds || [], updated_at: new Date().toISOString() });
    toast(r.error ? 'Could not save your settings: ' + r.error.message : 'Message settings saved.');
  }

  /* ---------------- UI ---------------- */
  var CSS = '#nmBtn{position:relative;margin-right:8px}#nmBtn .nm-badge{position:absolute;top:-6px;right:-6px;min-width:17px;height:17px;border-radius:9px;background:#C0392B;color:#fff;font-size:10.5px;font-weight:700;line-height:17px;text-align:center;padding:0 4px;box-sizing:border-box}' +
    '.nm-ov{position:fixed;inset:0;z-index:220;background:rgba(16,24,43,.25)}.nm-panel{position:fixed;top:0;right:0;bottom:0;width:min(480px,100vw);background:var(--surface,#fff);color:var(--ink,#10182B);box-shadow:-10px 0 30px rgba(16,24,43,.2);display:flex;flex-direction:column;font-size:13px;z-index:221}' +
    '.nm-hd{display:flex;gap:6px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line,#DFE3EB)}.nm-hd h3{margin:0;font-size:16px;flex:1}' +
    '.nm-tabs{display:flex;gap:4px;padding:8px 14px;border-bottom:1px solid var(--line,#DFE3EB);flex-wrap:wrap}.nm-tabs button,.nm-hbtn{border:1px solid var(--line,#DFE3EB);background:#fff;border-radius:14px;padding:3px 10px;font:inherit;font-size:12px;cursor:pointer;color:inherit}.nm-tabs button.on{background:var(--nav,#1F3A68);border-color:var(--nav,#1F3A68);color:#fff}' +
    '.nm-body{flex:1;overflow:auto;padding:8px 14px 16px}.nm-item{border:1px solid var(--line,#DFE3EB);border-radius:8px;padding:9px 10px;margin:8px 0;background:#fff}.nm-item.unread{border-left:4px solid var(--nav,#1F3A68);background:#F7F9FD}' +
    '.nm-meta{display:flex;gap:6px;align-items:center;font-size:11.5px;color:var(--ink-3,#6B7489);flex-wrap:wrap}.nm-kind{color:#fff;border-radius:8px;padding:0 6px;font-size:10.5px;font-weight:700}.nm-title{font-weight:600;margin:3px 0}.nm-text{white-space:pre-wrap;word-break:break-word}' +
    '.nm-acts{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.nm-acts button,.nm-acts a{border:1px solid var(--line,#DFE3EB);background:#fff;border-radius:6px;padding:3px 8px;font:inherit;font-size:11.5px;cursor:pointer;color:inherit;text-decoration:none}' +
    '.nm-pri{background:var(--nav,#1F3A68)!important;color:#fff!important;border-color:var(--nav,#1F3A68)!important}.nm-in{width:100%;box-sizing:border-box;border:1px solid var(--line,#DFE3EB);border-radius:6px;padding:6px 8px;font:inherit;font-size:12.5px;margin:3px 0 8px}' +
    '.nm-att{display:inline-block;margin:4px 6px 0 0;font-size:11.5px;color:var(--nav,#1F3A68);cursor:pointer;text-decoration:underline}.nm-thread{margin-top:8px;border-left:2px solid var(--line,#DFE3EB);padding-left:8px}.nm-empty{color:var(--ink-3,#6B7489);padding:20px 4px;text-align:center}';
  function ensureCss() { if (document.getElementById('nm-css')) return; var st = document.createElement('style'); st.id = 'nm-css'; st.textContent = CSS; document.head.appendChild(st); }
  function paintBtn() {
    var b = document.getElementById('nmBtn'); if (!b) return;
    b.hidden = M.missing || !me();
    b.innerHTML = '✉' + (M.unread ? '<span class="nm-badge">' + (M.unread > 99 ? '99+' : M.unread) + '</span>' : '');
    b.title = M.unread ? M.unread + ' unread message' + (M.unread === 1 ? '' : 's') : 'Messages';
    b.setAttribute('aria-label', b.title);
  }
  function nameOf(id) { var d = (M.dir || []).filter(function (x) { return x.id === id; })[0]; return d ? d.name : 'someone'; }
  function attHtml(list) { return (list || []).map(function (a) { return '<span class="nm-att" data-a="att" data-p="' + esc(a.path) + '">📎 ' + esc(a.name) + '</span>'; }).join(''); }
  function itemHtml(m) {
    var k = KIND[m.kind] || KIND.message, u = me(), mine = !!(u && m.sender_id === u.id), url = linkUrl(m), th = M.expanded[m.id];
    var h = '<div class="nm-item ' + (m.status === 'unread' && !mine ? 'unread' : '') + '"><div class="nm-meta"><span class="nm-kind" style="background:' + k[1] + '">' + k[0] + '</span>' +
      '<span>' + (mine ? 'To ' + esc(nameOf(m.recipient_id)) : 'From ' + esc(m.sender_name || 'North')) + '</span><span>·</span><span title="' + esc(new Date(m.created_at).toLocaleString('en-AU')) + '">' + esc(when(m.created_at)) + '</span>' +
      (m.status === 'actioned' ? '<span>· ✓ actioned ' + esc(when(m.actioned_at)) + '</span>' : '') + (m.status === 'archived' ? '<span>· archived</span>' : '') + '</div>' +
      '<div class="nm-title">' + esc(m.title) + '</div>' + (m.body ? '<div class="nm-text">' + esc(m.body) + '</div>' : '') + attHtml(m.attachments);
    if (th) h += '<div class="nm-thread">' + th.filter(function (x) { return x.id !== m.id; }).map(function (x) {
      return '<div style="margin:6px 0"><div class="nm-meta"><b>' + esc(x.sender_name || 'North') + '</b> · ' + esc(when(x.created_at)) + '</div><div class="nm-text">' + esc(x.body || x.title) + '</div>' + attHtml(x.attachments) + '</div>'; }).join('') + '</div>';
    h += '<div class="nm-acts">' + (url ? '<a href="' + esc(url) + '" target="tool_' + esc((m.link_module || '').replace(/\W/g, '')) + '">Open ' + esc(m.link_label || m.link_module) + ' →</a>' : '');
    if (m.sender_id) h += '<button data-a="reply" data-id="' + m.id + '">Reply</button>';
    if (!th) h += '<button data-a="thread" data-id="' + m.id + '">Show conversation</button>';
    if (!mine) {
      h += m.status === 'unread' ? '<button data-a="st" data-s="read" data-id="' + m.id + '">Mark read</button>' : '<button data-a="st" data-s="unread" data-id="' + m.id + '">Mark unread</button>';
      if (m.status !== 'actioned') h += '<button data-a="st" data-s="actioned" data-id="' + m.id + '">✓ Actioned</button>';
      h += m.status !== 'archived' ? '<button data-a="st" data-s="archived" data-id="' + m.id + '">Archive</button>' : '<button data-a="st" data-s="read" data-id="' + m.id + '">Restore</button>';
    }
    return h + '</div>' + (M.replyTo === m.id ? replyHtml() : '') + '</div>';
  }
  function filesHtml() {
    return '<input type="file" id="nmFiles" multiple accept="image/*,video/*,.pdf,.txt,.log,.csv,.docx,.xlsx" style="font-size:12px;margin:2px 0 6px">' +
      (M.files.length ? '<div class="nm-meta">' + M.files.map(function (f) { return esc(f.name); }).join(', ') + '</div>' : '') +
      '<div class="nm-meta">Screenshots and short videos help — up to 50 MB each.</div>';
  }
  function replyHtml() {
    return '<div style="margin-top:8px"><textarea id="nmReply" class="nm-in" rows="3" placeholder="Write a reply…" data-nm-skip></textarea>' + filesHtml() +
      '<div class="nm-acts"><button class="nm-pri" data-a="sendreply" ' + (M.busy ? 'disabled' : '') + '>' + (M.busy ? 'Sending…' : 'Send reply') + '</button><button data-a="cancelreply">Cancel</button></div></div>';
  }
  function composeHtml() {
    var c = M.compose, d = M.dir || [];
    return '<div class="nm-item"><div class="nm-title">New message</div><label class="nm-meta">To</label><select id="nmTo" class="nm-in"><option value="">— choose a person —</option>' +
      d.map(function (p) { return '<option value="' + p.id + '"' + (c.to === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
      '<label class="nm-meta">Subject</label><input id="nmTitle" class="nm-in" maxlength="200" value="' + esc(c.title || '') + '" data-nm-skip>' +
      '<label class="nm-meta">Message</label><textarea id="nmBody" class="nm-in" rows="5" data-nm-skip>' + esc(c.body || '') + '</textarea>' + filesHtml() +
      (c.linkLabel ? '<div class="nm-meta">About: ' + esc(c.linkLabel) + '</div>' : '') +
      '<div class="nm-acts"><button class="nm-pri" data-a="sendnew" ' + (M.busy ? 'disabled' : '') + '>' + (M.busy ? 'Sending…' : 'Send') + '</button><button data-a="cancelnew">Cancel</button></div></div>';
  }
  var CH = [['email', 'Email'], ['slack', 'Slack'], ['teams', 'Microsoft Teams'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']];
  function settingsHtml() {
    var p = M.prefs; if (!p) return '<div class="nm-empty">Loading…</div>';
    var on = {}; (M.chan || []).forEach(function (c) { if (c.enabled) on[c.channel] = c; });
    var muted = p.muted_kinds || [], chans = p.channels || {};
    return '<div class="nm-item"><div class="nm-title">Where should copies of my messages go?</div>' +
      '<div class="nm-meta" style="margin-bottom:6px">Every message always appears here in North. These are extra copies, sent only on channels your organisation has switched on (Configuration › Messages &amp; channels).</div>' +
      CH.map(function (c) {
        var avail = !!on[c[0]], v = chans[c[0]] === undefined ? c[0] === 'email' : !!chans[c[0]];
        return '<label style="display:block;margin:3px 0;' + (avail ? '' : 'opacity:.5') + '"><input type="checkbox" data-a="pch" data-c="' + c[0] + '" ' + (v ? 'checked' : '') + ' ' + (avail ? '' : 'disabled') + '> ' + c[1] +
          (avail ? '' : ' <span class="nm-meta">(not set up for your organisation)</span>') + '</label>'; }).join('') +
      '<label class="nm-meta" style="margin-top:8px;display:block">Email (blank = your login email)</label><input class="nm-in" id="nmPEmail" value="' + esc(p.email || '') + '" data-nm-skip>' +
      '<label class="nm-meta">Mobile for SMS / WhatsApp (international format, e.g. +61400111222)</label><input class="nm-in" id="nmPPhone" value="' + esc(p.phone || '') + '" data-nm-skip>' +
      '<label class="nm-meta">Slack member ID (Slack › your profile › ⋮ › Copy member ID)</label><input class="nm-in" id="nmPSlack" value="' + esc(p.slack_user_id || '') + '" data-nm-skip>' +
      '<div class="nm-title" style="margin-top:6px">Keep these in North only (no copies):</div>' +
      ['task', 'deadline', 'approval', 'mention', 'issue', 'message'].map(function (k) { return '<label style="display:inline-block;margin:2px 10px 2px 0"><input type="checkbox" data-a="pmute" data-k="' + k + '" ' + (muted.indexOf(k) >= 0 ? 'checked' : '') + '> ' + KIND[k][0] + '</label>'; }).join('') +
      '<div class="nm-acts" style="margin-top:10px"><button class="nm-pri" data-a="psave">Save my settings</button></div></div>';
  }
  function paint() {
    var ov = document.getElementById('nmOv'); if (!ov) return;
    var body;
    if (M.compose) body = composeHtml();
    else if (M.tab === 'settings') body = settingsHtml();
    else body = (M.msg ? '<div class="nm-empty">' + esc(M.msg) + '</div>' : '') +
      (M.list.length ? M.list.map(itemHtml).join('') : (M.msg ? '' : '<div class="nm-empty">' + (M.tab === 'sent' ? 'Nothing sent yet.' : M.filter === 'unread' ? 'No unread messages.' : 'No messages here.') + '</div>'));
    ov.querySelector('.nm-panel').innerHTML = '<div class="nm-hd"><h3>✉ Messages' + (M.unread ? ' <span class="nm-meta" style="display:inline">(' + M.unread + ' unread)</span>' : '') + '</h3>' +
      '<button class="nm-hbtn" data-a="new">+ New</button><button data-a="close" aria-label="Close" style="border:none;background:none;font-size:20px;cursor:pointer;line-height:1;color:inherit">×</button></div>' +
      '<div class="nm-tabs">' + [['inbox:unread', 'Unread'], ['inbox:all', 'All'], ['inbox:actioned', 'Actioned'], ['inbox:archived', 'Archived'], ['sent:', 'Sent'], ['settings:', 'My settings']].map(function (t) {
        var p = t[0].split(':'), on = !M.compose && M.tab === p[0] && (p[0] !== 'inbox' || M.filter === p[1]);
        return '<button data-a="tab" data-t="' + t[0] + '" class="' + (on ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="nm-body">' + body + '</div>';
    var fi = document.getElementById('nmFiles'); if (fi) fi.onchange = function () { M.files = [].slice.call(fi.files || []); };
  }
  async function openPanel(tab) {
    ensureCss(); M.open = true;
    if (tab) { var p = String(tab).split(':'); M.tab = p[0]; if (p[1]) M.filter = p[1]; }
    var ov = document.getElementById('nmOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'nmOv'; ov.className = 'nm-ov'; ov.innerHTML = '<div class="nm-panel" role="dialog" aria-label="Messages"></div>'; document.body.appendChild(ov);
      ov.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    }
    paint(); await directory();
    if (M.tab === 'settings') loadPrefs(); else load();
  }
  function closePanel() { M.open = false; M.compose = null; M.replyTo = null; M.files = []; var ov = document.getElementById('nmOv'); if (ov) ov.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') closePanel(); }
  async function onClick(e) {
    if (e.target.id === 'nmOv') { closePanel(); return; }
    var t = e.target.closest('[data-a]'); if (!t) return;
    var a = t.getAttribute('data-a'), id = t.getAttribute('data-id');
    if (a === 'close') closePanel();
    else if (a === 'tab') { var p = t.getAttribute('data-t').split(':'); M.compose = null; M.replyTo = null; M.tab = p[0]; if (p[1]) M.filter = p[1]; M.list = []; paint(); if (M.tab === 'settings') loadPrefs(); else load(); }
    else if (a === 'st') setStatus(id, t.getAttribute('data-s'));
    else if (a === 'att') openAttachment(t.getAttribute('data-p'));
    else if (a === 'thread') { var m0 = M.list.filter(function (x) { return x.id === id; })[0]; if (m0) loadThread(m0); }
    else if (a === 'reply') { M.replyTo = id; M.files = []; paint(); var ta = document.getElementById('nmReply'); if (ta) ta.focus(); }
    else if (a === 'cancelreply') { M.replyTo = null; M.files = []; paint(); }
    else if (a === 'sendreply') {
      var m = M.list.filter(function (x) { return x.id === M.replyTo; })[0], txt = (document.getElementById('nmReply') || {}).value || '';
      if (!m || (!txt.trim() && !M.files.length)) { toast('Write a reply first.'); return; }
      var u = me(), to = m.sender_id === u.id ? m.recipient_id : m.sender_id;
      if (!to) { toast('This message came from North itself, so there is nobody to reply to.'); return; }
      M.busy = true; paint();
      try {
        await send({ to: to, title: /^re: /i.test(m.title) ? m.title : 'Re: ' + m.title, body: txt, kind: m.kind === 'issue' ? 'issue' : 'message', parent: m.id, files: M.files });
        if (m.status === 'unread' && m.recipient_id === u.id) await setStatus(m.id, 'read');
        M.replyTo = null; M.files = []; toast('Reply sent.'); loadThread(m);
      } catch (er) { toast('Could not send: ' + (er.message || er)); }
      M.busy = false; paint();
    }
    else if (a === 'new') { M.compose = { to: '', title: '', body: '' }; M.files = []; await directory(); paint(); }
    else if (a === 'cancelnew') { M.compose = null; M.files = []; paint(); }
    else if (a === 'sendnew') {
      var c = M.compose;
      c.to = (document.getElementById('nmTo') || {}).value; c.title = (document.getElementById('nmTitle') || {}).value; c.body = (document.getElementById('nmBody') || {}).value;
      if (!c.to) { toast('Choose who to send it to.'); return; }
      if (!(c.title || '').trim() && !(c.body || '').trim()) { toast('Write something first.'); return; }
      M.busy = true; paint();
      try {
        await send({ to: c.to, title: c.title || 'Message', body: c.body, kind: c.kind || 'message', linkModule: c.linkModule, linkRecord: c.linkRecord, linkLabel: c.linkLabel, files: M.files });
        toast('Message sent.'); M.compose = null; M.files = []; M.tab = 'sent'; load();
      } catch (er) { toast('Could not send: ' + (er.message || er)); }
      M.busy = false; paint();
    }
    else if (a === 'pch') { M.prefs.channels = Object.assign({}, M.prefs.channels || {}); M.prefs.channels[t.getAttribute('data-c')] = t.checked; }
    else if (a === 'pmute') { var k = t.getAttribute('data-k'), arr = (M.prefs.muted_kinds || []).filter(function (x) { return x !== k; }); if (t.checked) arr.push(k); M.prefs.muted_kinds = arr; }
    else if (a === 'psave') {
      M.prefs.email = document.getElementById('nmPEmail').value.trim();
      M.prefs.phone = document.getElementById('nmPPhone').value.replace(/[^\d+]/g, '');
      M.prefs.slack_user_id = document.getElementById('nmPSlack').value.trim();
      savePrefs();
    }
  }
  async function compose(o) {
    o = o || {}; await openPanel('inbox');
    M.compose = { to: o.to || '', title: o.title || '', body: o.body || '', kind: o.kind, linkModule: o.linkModule, linkRecord: o.linkRecord, linkLabel: o.linkLabel };
    M.files = []; paint();
  }

  /* ---------------- @mentions in any text field ---------------- */
  function fieldLabel(el) {
    var lab = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
    var td = el.closest('td');
    if (!lab && td) { var tr = td.closest('tr'), table = td.closest('table'), ths = table ? table.querySelectorAll('thead th') : [], i = [].indexOf.call(tr.children, td); if (ths[i]) lab = ths[i].textContent.trim(); }
    var card = el.closest('.card'), h = card && card.querySelector('h3'), sec = h && h.childNodes[0] ? (h.childNodes[0].textContent || '').trim() : '';
    return [sec, lab].filter(Boolean).join(' › ').slice(0, 120);
  }
  function mentionsIn(text, dir, myId) {
    /* longest names first, so "@Jane Smith" is Jane Smith and not also a person called "Jane" */
    var low = String(text || '').toLowerCase(), hits = [], taken = [];
    (dir || []).slice().sort(function (a, b) { return String(b.name || '').length - String(a.name || '').length; }).forEach(function (p) {
      var n = String(p.name || '').trim().toLowerCase(); if (n.length < 2) return;
      var from = 0, i;
      while ((i = low.indexOf('@' + n, from)) >= 0) {
        from = i + 1;
        var nx = low.charAt(i + n.length + 1);
        if (nx && !/[\s.,;:!?)]/.test(nx)) continue;
        if (taken.some(function (t) { return i >= t[0] && i < t[1]; })) continue;
        taken.push([i, i + n.length + 1]);
        if (p.id !== myId && hits.indexOf(p) < 0) hits.push(p);
      }
    });
    return hits;
  }
  async function onFieldChange(e) {
    var el = e.target; if (!el || !el.closest || el.closest('#nmOv,#aflModal,.asst,[data-nm-skip]')) return;
    var text = el.isContentEditable ? (el.textContent || '') : (el.value || ''); if (typeof text !== 'string' || text.indexOf('@') < 0 || !me()) return;
    var hits = mentionsIn(text, await directory(), me().id); if (!hits.length) return;
    var h1 = document.querySelector('#main h1'), page = h1 ? h1.textContent.trim() : document.title.split('—')[0].trim(), lab = fieldLabel(el);
    var mod = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    for (var i = 0; i < hits.length; i++) {
      try {
        var id = await send({ to: hits[i].id, kind: 'mention', title: (me().name || 'Someone') + ' mentioned you' + (page ? ' in ' + page : ''),
          body: (lab ? lab + ':\n' : '') + text.slice(0, 1500), linkModule: mod, linkLabel: page, dedupe: 'mention:' + mod + ':' + fnv(lab + '|' + text) });
        if (id) toast('Sent a message to ' + hits[i].name + '.');
      } catch (er) { console.warn('mention message failed', er); }
    }
  }

  /* ---------------- boot ---------------- */
  function mountBtn() {
    if (document.getElementById('nmBtn')) return true;
    var acct = document.getElementById('tnAcct'); if (!acct || !acct.parentNode) return false;
    ensureCss();
    var b = document.createElement('button'); b.id = 'nmBtn'; b.type = 'button'; b.className = 'btn sm'; b.hidden = true; b.onclick = function () { openPanel(); };
    acct.parentNode.insertBefore(b, acct); paintBtn(); return true;
  }
  function realtime() {
    var s = S(), u = me(); if (!s || !s.channel || !u) return;
    try {
      s.channel('nm-' + u.id).on('postgres_changes', { event: '*', schema: 'public', table: 'user_messages', filter: 'recipient_id=eq.' + u.id }, function (p) {
        countUnread(); if (M.open && M.tab === 'inbox' && !M.compose) load();
        if (p && p.eventType === 'INSERT' && p.new) toast('✉ New message: ' + (p.new.title || ''));
      }).subscribe();
    } catch (e) { /* realtime not enabled for this table: the 60-second check covers it */ }
  }
  function dailyDeadlines() {
    var u = me(), k = 'nm-deadlines-' + u.id, today = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem(k) === today) return; } catch (e) { /* storage blocked */ }
    S().rpc('generate_my_deadline_messages').then(function (r) {
      if (r.error) return;
      try { localStorage.setItem(k, today); } catch (e) { /* storage blocked */ }
      if (r.data) { countUnread(); dispatchSoon(); }
    });
  }
  var tries = 0, tick = setInterval(function () {
    if (++tries > 240) { clearInterval(tick); return; }
    if (!S() || !me() || !mountBtn()) return;
    clearInterval(tick); M.ready = true;
    countUnread().then(function () { if (M.missing) return; realtime(); dailyDeadlines(); setInterval(countUnread, 60000); });
    document.addEventListener('change', onFieldChange, true);
    document.addEventListener('focusout', function (e) { if (e.target && e.target.isContentEditable) onFieldChange(e); }, true);
  }, 500);
  setInterval(function () { if (M.ready && !document.getElementById('nmBtn')) mountBtn(); }, 3000);   // a page redrew its top bar

  /* the "Report an issue" widget on every page: optional screenshots / video (stored under <org>/feedback/...) */
  function mountFeedbackFiles() {
    var c = document.getElementById('fbComment'); if (!c || document.getElementById('fbFiles') || M.missing) return;
    var d = document.createElement('div'); d.style.margin = '-6px 0 12px';
    d.innerHTML = '<label style="font-size:11px;font-weight:600;color:#666;display:block;margin-bottom:3px">Screenshots or a short video (optional)</label>' +
      '<input type="file" id="fbFiles" multiple accept="image/*,video/*" style="font-size:12px">' +
      '<div style="font-size:11px;color:#888;margin-top:3px">You will get a message in ✉ when it is updated or fixed.</div>';
    (c.parentNode.parentNode || c.parentNode).insertBefore(d, c.parentNode.nextSibling);
  }
  async function feedbackAttachments() {
    var fi = document.getElementById('fbFiles'); if (!fi || !fi.files || !fi.files.length || M.missing) return {};
    var s = S(), o = g('_orgId'), u = me(), out = [];
    for (var i = 0; i < fi.files.length && i < 5; i++) {
      var f = fi.files[i]; if (f.size > MAX_FILE) { toast(f.name + ' is over 50 MB and was left out.'); continue; }
      var path = o + '/feedback/' + u.id + '/' + Date.now() + '-' + f.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      var r = await s.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream' });
      if (!r.error) out.push({ path: path, name: f.name, size: f.size, type: f.type || '' }); else toast('Could not upload ' + f.name + ': ' + r.error.message);
    }
    fi.value = '';
    return out.length ? { attachments: out } : {};
  }
  setInterval(mountFeedbackFiles, 1500);

  window.NorthMessages = { open: openPanel, compose: compose, refresh: countUnread, send: send, openAttachment: openAttachment, feedbackAttachments: feedbackAttachments, _state: M,
    _test: { when: when, linkUrl: linkUrl, fnv: fnv, mentionsIn: mentionsIn, itemHtml: itemHtml, settingsHtml: settingsHtml } };
})();
