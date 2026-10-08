/* shared/aiFill.js (2026-10-08, Stef: "ingest a briefing document or a number of documents from a folder and
   pre-fill the events information, perhaps even watch that folder ... also speak to the screen I am in and
   have information filled in").

   ONE "Fill from brief" engine for every page. A page registers a SCHEMA (its fields + any repeating lists);
   this module supplies the input side (speak / type / paste / load files incl. Word / pick a folder and watch
   it), runs the AI through the org's existing router (NorthAI, area 'doc_extract'), then shows a per-field
   REVIEW (current vs proposed). NOTHING is written until the person accepts; accepted values go through the
   page's own setters, so roles, audit and saving behave exactly as if typed by hand.

   Page usage:
     NorthAIFill.register('event', function (ctx) { return {
       key: 'event:' + ctx.eventId,            // unique per record (folder-watch is remembered per key)
       title: 'Event: Summit 2027',
       canEdit: function () { return !isViewer(); },
       fields: [ { key, label, type: 'text|longtext|number|money|date|select|html', options: [{value,label}], hint,
                   get: function () { return current raw value; }, set: function (v) { ... } } ],
       lists:  [ { key, label, hint, matchKey: 'name',
                   columns: [ { key, label, type, options } ],
                   rows: function () { return existing row objects; },
                   add: function (obj) { ... }, update: function (row, obj) { ... } } ],
       after: function () { render(); },        // called once after Apply
       onApplied: function (summary) { logAudit(...); }
     }; });
     NorthAIFill.open('event', { eventId: id });

   Also exported for other flows (e.g. the Campaign Planning wizard): fileToText(file), createDictation(opts),
   speechSupported(), FILE_ACCEPT.

   Honest limits: PDF is NOT read yet (Word, text, CSV, JSON, HTML are). Voice uses the browser's own speech
   recognition (Chrome/Edge; Safari is inconsistent). Folder watching uses the browser folder picker (Chrome/
   Edge only) and only checks while North is open -- it never runs in the background. */
(function () {
  'use strict';
  var REG = {}, S = null, WATCH = {};
  var TEXT_EXT = /\.(txt|md|markdown|csv|json|html?|xml)$/i, DOCX_EXT = /\.docx$/i;
  var FILE_ACCEPT = '.txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.docx';
  var MAX_FILE_BYTES = 5 * 1024 * 1024, MAX_FILE_CHARS = 30000, MAX_TOTAL_CHARS = 60000, MAX_FOLDER_FILES = 25, POLL_MS = 15000;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (typeof window.toast === 'function') window.toast(m); else console.log('[aiFill] ' + m); }
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function isoOk(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function htmlToPlain(h) { var d = document.createElement('div'); d.innerHTML = String(h || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
  function htmlFromText(t) { return String(t || '').split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }

  /* ---------------- reading files ---------------- */
  function decodeEntities(s) {
    return s.replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCodePoint(parseInt(h, 16)); }).replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  /* tiny dependency-free .zip reader -- enough to pull word/document.xml out of a .docx */
  async function zipEntryText(buf, want) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), eocd = -1, i;
    for (i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('That does not look like a valid Word (.docx) file.');
    var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true);
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      var name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      if (name === want) {
        var start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u8.subarray(start, start + csize);
        if (method === 0) return new TextDecoder().decode(data);
        if (method === 8) {
          if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open Word files -- use a current Chrome or Edge, or paste the text instead.');
          return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
        }
        throw new Error('That Word file uses an unsupported compression method.');
      }
      p += 46 + nlen + xlen + clen;
    }
    return null;
  }
  async function docxText(buf) {
    var xml = await zipEntryText(buf, 'word/document.xml');
    if (xml == null) throw new Error('That Word file has no readable document body.');
    xml = xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>\s*<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<[^>]+>/g, '');
    return decodeEntities(xml).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function htmlToText(raw) {
    var doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script,style,noscript').forEach(function (n) { n.remove(); });
    doc.querySelectorAll('br,p,div,li,tr,h1,h2,h3,h4,h5,h6').forEach(function (n) { n.appendChild(doc.createTextNode('\n')); });
    return (doc.body ? doc.body.textContent : '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function unsupportedMsg(name) {
    return (/\.pdf$/i.test(name) ? 'PDF files can’t be read yet' : 'That file type can’t be read yet') + ' (' + name + '). Save it as Word (.docx) or text, or paste the text in. Supported: .docx .txt .md .csv .json .html';
  }
  async function fileToText(file) {
    var name = (file && file.name) || '';
    if (file.size > MAX_FILE_BYTES) throw new Error(name + ' is larger than 5 MB.');
    if (DOCX_EXT.test(name)) return docxText(await file.arrayBuffer());
    if (/\.(html?|xml)$/i.test(name)) return htmlToText(await file.text());
    if (TEXT_EXT.test(name)) return file.text();
    var e = new Error(unsupportedMsg(name)); e.unsupported = true; throw e;
  }

  /* ---------------- speaking ---------------- */
  function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  /* opts: { lang, onUpdate(finalText, interim), onState(active), onError(code) } */
  function createDictation(o) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return null;
    o = o || {}; var rec = null, active = false, finalText = '';
    function setState(a) { active = a; if (o.onState) o.onState(a); }
    return {
      isActive: function () { return active; },
      start: function (initial) {
        finalText = initial || ''; rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = o.lang || 'en-AU';
        rec.onresult = function (ev) {
          var interim = '';
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            var r = ev.results[i];
            if (r.isFinal) finalText += (finalText ? ' ' : '') + r[0].transcript.trim(); else interim += r[0].transcript;
          }
          if (o.onUpdate) o.onUpdate(finalText, interim);
        };
        rec.onerror = function (ev) { console.warn('Dictation error', ev.error); if (o.onError) o.onError(ev.error); };
        rec.onend = function () { setState(false); if (o.onUpdate) o.onUpdate(finalText, ''); };
        try { rec.start(); setState(true); } catch (e) { setState(false); if (o.onError) o.onError(String((e && e.message) || e)); }
      },
      stop: function () { try { if (rec) rec.stop(); } catch (e) { /* already stopped */ } }
    };
  }

  /* ---------------- folder (browser route) ---------------- */
  function dirSupported() { return typeof window.showDirectoryPicker === 'function'; }
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('northm_aifill', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('handles'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function idbOp(mode, fn) { return idb().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction('handles', mode), rq = fn(tx.objectStore('handles')); tx.oncomplete = function () { res(rq && rq.result); }; tx.onerror = function () { rej(tx.error); }; }); }); }
  function saveHandle(key, h) { return idbOp('readwrite', function (st) { return st.put(h, key); }).catch(function () { }); }
  function loadHandle(key) { return idbOp('readonly', function (st) { return st.get(key); }).catch(function () { return null; }); }
  function dropHandle(key) { return idbOp('readwrite', function (st) { return st.delete(key); }).catch(function () { }); }

  async function scanDir(handle) {
    var out = [];
    async function walk(dir, prefix, depth) {
      for await (var ent of dir.values()) {
        if (ent.kind === 'file') {
          if (!(TEXT_EXT.test(ent.name) || DOCX_EXT.test(ent.name)) || ent.name.indexOf('~$') === 0) continue;
          var f = await ent.getFile(); out.push({ path: prefix + ent.name, fh: ent, mtime: f.lastModified, size: f.size });
        } else if (ent.kind === 'directory' && depth < 2) await walk(ent, prefix + ent.name + '/', depth + 1);
      }
    }
    await walk(handle, '', 0);
    out.sort(function (a, b) { return b.mtime - a.mtime; });
    return out.slice(0, MAX_FOLDER_FILES);
  }
  function sigOf(list) { return list.map(function (f) { return f.path + '|' + f.mtime + '|' + f.size; }).sort().join(';'); }
  async function haveRead(handle) { try { return (await handle.queryPermission({ mode: 'read' })) === 'granted'; } catch (e) { return false; } }

  async function attachWatch(key, label, id, ctx, handle) {
    stopWatch(key, false);
    var w = WATCH[key] = { key: key, id: id, ctx: ctx, label: label, handle: handle, name: handle.name, meta: [], sig: '', changed: 0, needsPerm: false, checked: null };
    if (!(await haveRead(handle))) { w.needsPerm = true; return w; }
    try { w.meta = await scanDir(handle); w.sig = sigOf(w.meta); w.checked = new Date(); } catch (e) { w.needsPerm = true; return w; }
    w.timer = setInterval(function () { pollWatch(w); }, POLL_MS);
    return w;
  }
  async function pollWatch(w) {
    if (document.hidden || WATCH[w.key] !== w) return;
    if (!(await haveRead(w.handle))) { w.needsPerm = true; clearInterval(w.timer); w.timer = null; if (S && S.schema.key === w.key) paint(); return; }
    try {
      var meta = await scanDir(w.handle), prev = {}, n = 0;
      w.meta.forEach(function (f) { prev[f.path] = f.mtime + '|' + f.size; });
      meta.forEach(function (f) { if (prev[f.path] !== f.mtime + '|' + f.size) n++; delete prev[f.path]; });
      n += Object.keys(prev).length;
      w.checked = new Date();
      if (n && sigOf(meta) !== w.sig && n !== w.changed) { w.changed = n; notifyChange(w); }
      else if (S && S.schema.key === w.key) paintWatchOnly();
    } catch (e) { /* folder went away -- leave the last known state */ }
  }
  function stopWatch(key, forget) {
    var w = WATCH[key]; if (w && w.timer) clearInterval(w.timer);
    delete WATCH[key]; if (forget) dropHandle(key);
    var chip = document.getElementById('aflChip'); if (chip && chip.getAttribute('data-key') === key) chip.remove();
  }
  function notifyChange(w) {
    if (S && S.schema.key === w.key) { paint(); return; }
    var chip = document.getElementById('aflChip');
    if (!chip) { chip = document.createElement('div'); chip.id = 'aflChip'; document.body.appendChild(chip); }
    ensureCss();
    chip.className = 'afl-chip'; chip.setAttribute('data-key', w.key);
    chip.innerHTML = '📁 ' + esc(w.changed) + ' change' + (w.changed === 1 ? '' : 's') + ' in the brief folder for ' + esc(w.label || 'this record') + ' <button type="button">Review</button><button type="button" class="x" aria-label="Dismiss">✕</button>';
    chip.querySelector('button').onclick = function () { chip.remove(); open(w.id, w.ctx); };
    chip.querySelector('.x').onclick = function () { chip.remove(); };
  }
  async function readFolderFiles(w) {
    var meta = await scanDir(w.handle), out = [], skipped = [];
    for (var i = 0; i < meta.length; i++) {
      try { var f = await meta[i].fh.getFile(); out.push({ name: meta[i].path, text: await fileToText(f), from: 'folder' }); }
      catch (e) { skipped.push(meta[i].path); }
    }
    w.meta = meta; w.sig = sigOf(meta); w.changed = 0; w.checked = new Date();
    return { files: out, skipped: skipped };
  }

  /* ---------------- prompt / interpretation ---------------- */
  function typeNote(c) {
    if (c.type === 'select') return 'one of exactly: ' + (c.options || []).map(function (o) { return '"' + o.label + '"'; }).join(' | ');
    return { text: 'short text', longtext: 'text (may be several sentences)', html: 'plain text, paragraphs separated by a blank line', number: 'number', money: 'number, no currency symbol (40k = 40000)', date: 'date as YYYY-MM-DD' }[c.type] || 'text';
  }
  function buildPrompt(sc) {
    var p = 'You fill in a form for: ' + sc.title + '.\nThe INPUT below may be a briefing document, meeting notes, a spoken transcript, or a short instruction such as "set the budget to forty thousand". ' +
      'Return ONLY one JSON object (no prose, no markdown). Include a key ONLY when the INPUT explicitly states or clearly implies that value; otherwise OMIT the key. Never guess or invent.\n' +
      'Rules: dates are YYYY-MM-DD, Australian day/month order, and when the year is missing use the next occurrence on or after today (' + todayIso() + '). Numbers have no symbols or thousands separators. Select values must match an option exactly.\n' + (sc.intro ? sc.intro + '\n' : '') + '\nFIELDS (key -> meaning):\n';
    sc.fields.forEach(function (f) { p += '- "' + f.key + '" (' + typeNote(f) + '): ' + f.label + (f.hint ? ' -- ' + f.hint : '') + (f.ctx != null && f.ctx !== '' ? ' [currently: "' + String(f.ctx).replace(/\s+/g, ' ').slice(0, 40) + '"]' : '') + '\n'; });
    if (sc.lists && sc.lists.length) {
      p += '\nLISTS: put them under a single key "_lists" as { "<listKey>": [ {item}, ... ] }, one object per distinct item mentioned, using only these columns:\n';
      sc.lists.forEach(function (l) {
        p += '- "' + l.key + '": ' + l.label + (l.hint ? ' -- ' + l.hint : '') + '. Columns: ' + l.columns.map(function (c) { return '"' + c.key + '" (' + typeNote(c) + ')'; }).join(', ') + '\n';
      });
    }
    return p;
  }
  function normVal(def, raw) {
    if (raw == null || raw === '') return undefined;
    var t = def.type, s;
    if (t === 'number' || t === 'money') { s = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,\s]/g, '')); return isFinite(s) ? s : undefined; }
    if (t === 'date') { s = String(raw).trim(); return isoOk(s) ? s : undefined; }
    if (t === 'select') {
      s = lc(raw); var o = (def.options || []).filter(function (x) { return lc(x.label) === s || lc(x.value) === s; })[0];
      return o ? o.value : undefined;
    }
    s = String(raw).replace(/\r/g, '').trim(); if (!s) return undefined;
    return s.slice(0, (t === 'longtext' || t === 'html') ? 8000 : 500);
  }
  function showVal(def, v) {
    if (v == null || v === '') return '';
    if (def.type === 'select') { var o = (def.options || []).filter(function (x) { return String(x.value) === String(v); })[0]; return o ? o.label : String(v); }
    if (def.type === 'html') return htmlToPlain(v);
    return String(v);
  }
  function sameVal(def, cur, val) {
    if (def.type === 'number' || def.type === 'money') return Number(cur) === val;
    if (def.type === 'select') return String(cur == null ? '' : cur) === String(val);
    if (def.type === 'html') return false;
    return String(cur == null ? '' : cur).trim() === val;
  }
  function isEmptyVal(def, v) { return v == null || v === '' || (def.type === 'html' && !htmlToPlain(v)) || ((def.type === 'number' || def.type === 'money') && !Number(v)); }
  function interpret(sc, raw) {
    var f = raw && typeof raw === 'object' ? raw : {};
    var known = sc.fields.map(function (x) { return x.key; }).concat('_lists');
    if (f.fields && typeof f.fields === 'object' && !known.some(function (k) { return k in f; })) f = f.fields;
    var out = { fields: [], lists: [] };
    sc.fields.forEach(function (def) {
      var val = normVal(def, f[def.key]); if (val === undefined) return;
      var cur = def.get(); if (sameVal(def, cur, val)) return;
      out.fields.push({ def: def, cur: cur, curShown: showVal(def, cur), val: val, curEmpty: isEmptyVal(def, cur) });
    });
    var L = f._lists || f.lists || {};
    (sc.lists || []).forEach(function (ld) {
      var arr = Array.isArray(L[ld.key]) ? L[ld.key] : [], items = [], seen = {};
      arr.forEach(function (rawItem) {
        if (!rawItem || typeof rawItem !== 'object') return;
        var obj = {}, any = false;
        ld.columns.forEach(function (c) { var v = normVal(c, rawItem[c.key]); if (v !== undefined) { obj[c.key] = v; any = true; } });
        if (!any) return;
        var mk = lc(obj[ld.matchKey]); if (mk) { if (seen[mk]) return; seen[mk] = 1; }
        var existing = mk ? (ld.rows() || []).filter(function (r) { return lc(r[ld.matchKey]) === mk; })[0] : null;
        if (existing) {
          var ch = [], overwrite = false;
          ld.columns.forEach(function (c) {
            if (!(c.key in obj) || c.key === ld.matchKey) return;
            if (sameVal(c, existing[c.key], obj[c.key])) return;
            if (!isEmptyVal(c, existing[c.key])) overwrite = true;
            ch.push({ col: c, cur: showVal(c, existing[c.key]), val: obj[c.key] });
          });
          if (ch.length) items.push({ kind: 'update', row: existing, obj: obj, changes: ch, overwrite: overwrite });
        } else items.push({ kind: 'add', obj: obj });
      });
      if (items.length) out.lists.push({ def: ld, items: items });
    });
    return out;
  }

  /* ---------------- UI ---------------- */
  var CSS = '.afl-ov{position:fixed;inset:0;background:rgba(16,24,43,.45);z-index:210;display:flex;align-items:flex-start;justify-content:center;padding:5vh 16px;overflow:auto}' +
    '.afl-box{background:var(--surface,#fff);color:var(--ink,#10182B);border-radius:12px;max-width:760px;width:100%;box-shadow:0 20px 50px rgba(16,24,43,.25);padding:20px 22px;font-size:13.5px;line-height:1.45}' +
    '.afl-box h3{margin:0 0 4px;font-size:16px}.afl-box .mini{font-size:12px;color:var(--ink-3,#6B7489)}' +
    '.afl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.afl-row .sp{flex:1}' +
    '.afl-btn{border:1px solid var(--line,#DFE3EB);background:#fff;color:inherit;border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;display:inline-block}' +
    '.afl-btn.pri{background:var(--nav,#1F3A68);border-color:var(--nav,#1F3A68);color:#fff}.afl-btn.rec{background:#C0392B;border-color:#C0392B;color:#fff}.afl-btn:disabled{opacity:.5;cursor:default}' +
    '.afl-box textarea,.afl-box input[type=text],.afl-box input[type=date],.afl-box select{width:100%;box-sizing:border-box;border:1px solid var(--line,#DFE3EB);border-radius:8px;padding:7px 8px;font:inherit;font-size:12.5px;background:#fff}' +
    '.afl-box textarea{margin-top:10px}.afl-msg{margin-top:10px;padding:8px 10px;border-radius:8px;background:#FFF4E5;border-left:3px solid #E69A1C;font-size:12.5px}' +
    '.afl-watch{margin-top:10px;padding:8px 10px;border-radius:8px;background:var(--canvas,#F4F6FA);font-size:12.5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.afl-watch.chg{background:#E8F3FF;border-left:3px solid var(--nav,#1F3A68)}' +
    '.afl-files{margin-top:8px;display:flex;flex-direction:column;gap:4px}.afl-file{display:flex;gap:8px;align-items:center;font-size:12.5px;padding:4px 8px;border:1px solid var(--line,#DFE3EB);border-radius:6px}.afl-file .sp{flex:1}.afl-file button{border:none;background:none;cursor:pointer;color:var(--ink-3,#6B7489)}' +
    '.afl-tbl{width:100%;border-collapse:collapse;margin-top:10px}.afl-tbl th{text-align:left;font-size:11px;color:var(--ink-3,#6B7489);padding:4px 6px;border-bottom:1px solid var(--line,#DFE3EB)}.afl-tbl td{padding:6px;border-bottom:1px solid var(--line,#EEF0F5);vertical-align:top;font-size:12.5px}' +
    '.afl-cur{color:var(--ink-3,#6B7489);max-width:200px;word-break:break-word}.afl-tag{display:inline-block;font-size:10.5px;border-radius:10px;padding:1px 7px;background:#E7F5EE;color:#0E6B3D;margin-right:6px}.afl-tag.u{background:#FFF1D6;color:#8A5A00}' +
    '.afl-fab{position:fixed;right:76px;bottom:24px;z-index:9998;border:none;border-radius:24px;padding:11px 16px;background:var(--nav,#1F3A68);color:#fff;font:inherit;font-size:13px;font-weight:600;box-shadow:0 4px 14px rgba(16,24,43,.3);cursor:pointer}.afl-fab[hidden],body.afl-open .afl-fab{display:none}body.asst-open .afl-fab{right:min(calc(var(--asst-w,380px) + 76px),calc(100vw - 200px))}@media print{.afl-fab{display:none}}' +
    '.afl-h{font-weight:600;margin-top:14px}.afl-chip{position:fixed;left:16px;bottom:16px;z-index:205;background:var(--nav,#1F3A68);color:#fff;border-radius:10px;padding:9px 12px;font-size:12.5px;box-shadow:0 6px 20px rgba(16,24,43,.3)}.afl-chip button{margin-left:8px;border:1px solid rgba(255,255,255,.6);background:transparent;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer}';
  function ensureCss() { if (document.getElementById('afl-css')) return; var s = document.createElement('style'); s.id = 'afl-css'; s.textContent = CSS; document.head.appendChild(s); }

  function totalInput() {
    var parts = [], used = 0, skipped = [];
    var typed = (S.text || '').trim();
    if (typed) { parts.push('=== Typed / spoken notes ===\n' + typed.slice(0, MAX_FILE_CHARS)); used += Math.min(typed.length, MAX_FILE_CHARS); }
    S.files.forEach(function (f) {
      if (used >= MAX_TOTAL_CHARS) { skipped.push(f.name); return; }
      var t = f.text.slice(0, Math.min(MAX_FILE_CHARS, MAX_TOTAL_CHARS - used));
      parts.push('=== File: ' + f.name + (t.length < f.text.length ? ' (truncated)' : '') + ' ===\n' + t); used += t.length;
    });
    return { text: parts.join('\n\n'), chars: used, skipped: skipped };
  }
  function watchHtml() {
    var w = WATCH[S.schema.key], h = '';
    if (!w) return '';
    if (w.needsPerm) return '<div class="afl-watch" id="aflWatch">📁 Folder “' + esc(w.name) + '” — the browser needs your OK to look at it again. <span style="flex:1"></span><button type="button" class="afl-btn" data-a="reconnect">Reconnect</button><button type="button" class="afl-btn" data-a="unwatch">Stop watching</button></div>';
    h += '<div class="afl-watch' + (w.changed ? ' chg' : '') + '" id="aflWatch">📁 Watching “' + esc(w.name) + '” (' + w.meta.length + ' file' + (w.meta.length === 1 ? '' : 's') + ', checked ' + (w.checked ? w.checked.toLocaleTimeString() : '—') + '; only while North is open)';
    h += '<span style="flex:1"></span>';
    if (w.changed) h += '<b>' + w.changed + ' change' + (w.changed === 1 ? '' : 's') + ' since last read</b><button type="button" class="afl-btn pri" data-a="readfolder">Read changes</button>';
    else h += '<button type="button" class="afl-btn" data-a="readfolder">Read folder now</button>';
    return h + '<button type="button" class="afl-btn" data-a="unwatch">Stop watching</button></div>';
  }
  function inputHtml() {
    var sc = S.schema, inp = totalInput(), sup = speechSupported();
    var h = '<h3>✨ Fill from brief <span class="mini">— ' + esc(sc.title) + '</span></h3>' +
      '<div class="mini">Speak, type, paste, or load a briefing document (Word, text, CSV…) or a whole folder of them. The AI proposes values and you review every one — nothing is saved until you accept.</div>' +
      '<div class="afl-row"><button type="button" class="afl-btn' + (S.rec ? ' rec' : '') + '" data-a="mic"' + (sup ? '' : ' disabled title="Speech recognition isn’t available in this browser — try Chrome or Edge"') + '>' + (S.rec ? '⏹ Stop' : '🎙 Speak') + '</button>' +
      '<label class="afl-btn" style="cursor:pointer">📎 Add files<input type="file" id="aflFile" multiple accept="' + FILE_ACCEPT + '" style="display:none"></label>' +
      (dirSupported() ? '<button type="button" class="afl-btn" data-a="folder">📁 ' + (WATCH[sc.key] ? 'Change folder' : 'Choose a folder to watch') + '</button>' : '<span class="mini" title="Folder watching needs Chrome or Edge">📁 Folder watching needs Chrome or Edge</span>') + '</div>';
    if (S.msg) h += '<div class="afl-msg">' + S.msg + '</div>';
    h += watchHtml();
    h += '<textarea id="aflText" rows="7" placeholder="Type, paste or speak a brief — or a short instruction like “budget is 40 thousand, status confirmed, add a speaker Jane Lee from Acme”">' + esc(S.text) + '</textarea>';
    h += '<div class="mini" id="aflInterim" style="min-height:16px">' + esc(S.interim || '') + '</div>';
    if (S.files.length) {
      h += '<div class="afl-files">' + S.files.map(function (f, i) { return '<div class="afl-file"><span>' + (f.from === 'folder' ? '📁' : '📄') + '</span><span>' + esc(f.name) + '</span><span class="mini">' + f.text.length.toLocaleString() + ' chars</span><span class="sp"></span>' + (f.from === 'folder' ? '' : '<button type="button" data-a="rmfile" data-i="' + i + '" aria-label="Remove">✕</button>') + '</div>'; }).join('') + '</div>';
    }
    h += '<details style="margin-top:8px"><summary class="mini">See exactly what will be sent to the AI (' + inp.chars.toLocaleString() + ' characters)' + (inp.skipped.length ? ' — ' + inp.skipped.length + ' file(s) over the size cap are left out' : '') + '</summary><textarea readonly rows="6">' + esc(inp.text) + '</textarea></details>';
    h += '<div class="afl-row"><span class="mini">Sent to your organisation’s chosen AI (Configuration → AI &amp; agents).</span><span class="sp"></span><button type="button" class="afl-btn" data-a="close">Cancel</button><button type="button" class="afl-btn pri" data-a="propose">Propose values →</button></div>';
    return h;
  }
  function workingHtml() { return '<h3>✨ Reading…</h3><div class="mini">The AI is reading your input and matching it to the fields. This can take a few seconds.</div><div class="afl-row"><span class="sp"></span><button type="button" class="afl-btn" data-a="cancelwork">Cancel</button></div>'; }
  function editorHtml(def, val, id) {
    var v = val == null ? '' : val;
    if (def.type === 'select') return '<select id="' + id + '">' + (def.options || []).map(function (o) { return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>';
    if (def.type === 'longtext' || def.type === 'html') return '<textarea id="' + id + '" rows="4" style="margin-top:0">' + esc(v) + '</textarea>';
    if (def.type === 'date') return '<input type="date" id="' + id + '" value="' + esc(v) + '">';
    return '<input type="text" id="' + id + '" value="' + esc(v) + '">';
  }
  function reviewHtml() {
    var P = S.proposal, n = P.fields.length + P.lists.reduce(function (a, l) { return a + l.items.length; }, 0);
    var h = '<h3>✨ Review proposed values <span class="mini">— ' + esc(S.schema.title) + '</span></h3>';
    if (!n) return h + '<div class="mini">The AI didn’t find anything new it could fill from that input (or everything already matches). Try adding more detail.</div><div class="afl-row"><span class="sp"></span><button type="button" class="afl-btn" data-a="back">← Back</button><button type="button" class="afl-btn" data-a="close">Close</button></div>';
    h += '<div class="mini">Tick what you want applied. Values that would <b>replace something already filled in</b> start unticked. You can edit a proposed value before applying.</div>';
    if (P.fields.length) {
      h += '<table class="afl-tbl"><tr><th></th><th>Field</th><th>Now</th><th>Proposed</th></tr>';
      P.fields.forEach(function (r, i) {
        var note = r.def.type === 'html' && !r.curEmpty ? '<div class="mini">Added below the existing text, under an “Imported” heading.</div>' : '';
        h += '<tr><td><input type="checkbox" id="aflC_f' + i + '"' + (r.curEmpty || r.def.type === 'html' ? ' checked' : '') + '></td><td>' + esc(r.def.label) + '</td><td class="afl-cur">' + (r.curShown ? esc(r.curShown.length > 140 ? r.curShown.slice(0, 140) + '…' : r.curShown) : '<span class="mini">empty</span>') + '</td><td>' + editorHtml(r.def, r.val, 'aflV_f' + i) + note + '</td></tr>';
      });
      h += '</table>';
    }
    P.lists.forEach(function (L, li) {
      h += '<div class="afl-h">' + esc(L.def.label) + ' — ' + L.items.length + ' proposed</div><table class="afl-tbl">';
      L.items.forEach(function (it, ii) {
        var desc;
        if (it.kind === 'add') desc = L.def.columns.filter(function (c) { return c.key in it.obj; }).map(function (c) { return '<span class="mini">' + esc(c.label) + ':</span> ' + esc(showVal(c, it.obj[c.key])); }).join(' &nbsp;·&nbsp; ');
        else desc = '<b>' + esc(it.row[L.def.matchKey]) + '</b> — ' + it.changes.map(function (c) { return '<span class="mini">' + esc(c.col.label) + ':</span> ' + (c.cur ? esc(c.cur) + ' → ' : '') + esc(showVal(c.col, c.val)); }).join(' &nbsp;·&nbsp; ');
        h += '<tr><td style="width:24px"><input type="checkbox" id="aflC_l' + li + '_' + ii + '"' + (it.kind === 'add' || !it.overwrite ? ' checked' : '') + '></td><td><span class="afl-tag' + (it.kind === 'update' ? ' u' : '') + '">' + (it.kind === 'add' ? 'Add' : 'Update') + '</span>' + desc + '</td></tr>';
      });
      h += '</table>';
    });
    h += '<div class="afl-row"><span class="mini">Applied values save through the page’s normal save.</span><span class="sp"></span><button type="button" class="afl-btn" data-a="back">← Back</button><button type="button" class="afl-btn" data-a="close">Cancel</button><button type="button" class="afl-btn pri" data-a="apply">Apply selected</button></div>';
    return h;
  }
  function paint() {
    var ov = document.getElementById('aflModal'); if (!ov || !S) return;
    ov.querySelector('.afl-box').innerHTML = S.phase === 'review' ? reviewHtml() : S.phase === 'working' ? workingHtml() : inputHtml();
    var ta = document.getElementById('aflText');
    if (ta) {
      ta.oninput = function () { S.text = ta.value; };
      var fi = document.getElementById('aflFile'); if (fi) fi.onchange = function () { addFiles(fi.files); fi.value = ''; };
      if (S.phase === 'input' && !S.rec) setTimeout(function () { try { ta.focus(); } catch (e) { } }, 0);
    }
  }
  function paintWatchOnly() { var el = document.getElementById('aflWatch'); if (!el || !S) return; var tmp = document.createElement('div'); tmp.innerHTML = watchHtml(); if (tmp.firstChild) el.replaceWith(tmp.firstChild); }

  async function addFiles(list) {
    var errs = [], files = Array.prototype.slice.call(list);
    for (var i = 0; i < files.length; i++) {
      try {
        var t = await fileToText(files[i]);
        if (!t.trim()) { errs.push(esc(files[i].name) + ' had no readable text.'); continue; }
        S.files = S.files.filter(function (f) { return !(f.name === files[i].name && f.from === 'upload'); });
        S.files.push({ name: files[i].name, text: t, from: 'upload' });
      } catch (e) { errs.push(esc(e.message || e)); }
    }
    S.msg = errs.join('<br>'); paint();
  }
  function toggleMic() {
    if (!speechSupported()) { toast('Speech recognition isn’t available in this browser — try Chrome or Edge.'); return; }
    if (S.rec) { if (S.dict) S.dict.stop(); return; }
    var ta = document.getElementById('aflText'); if (ta) S.text = ta.value;
    S.dict = createDictation({
      onUpdate: function (finalText, interim) { if (!S) return; S.text = finalText; S.interim = interim; var t = document.getElementById('aflText'), im = document.getElementById('aflInterim'); if (t) t.value = finalText; if (im) im.textContent = interim ? '… ' + interim : ''; },
      onState: function (a) { if (!S) return; S.rec = a; if (!a && S.autoPropose && S.phase === 'input' && (S.text || '').trim()) { S.autoPropose = false; propose(); return; } if (S.phase === 'input') paint(); },
      onError: function (code) { if (!S) return; if (code === 'not-allowed' || code === 'service-not-allowed') S.msg = 'Microphone access was blocked — allow it in your browser’s site settings to speak.'; else if (code !== 'no-speech' && code !== 'aborted') S.msg = 'Speech recognition stopped (' + esc(code) + ').'; if (S.phase === 'input') paint(); }
    });
    S.dict.start(S.text);
  }
  async function pickFolder() {
    try {
      var h = await window.showDirectoryPicker({ mode: 'read' });
      var w = await attachWatch(S.schema.key, S.schema.title, S.id, S.ctx, h); saveHandle(S.schema.key, h);
      await loadFolder(w);
    } catch (e) { if (e && e.name !== 'AbortError') { S.msg = 'Couldn’t open that folder: ' + esc(e.message || e); paint(); } }
  }
  async function loadFolder(w) {
    var r = await readFolderFiles(w);
    S.files = S.files.filter(function (f) { return f.from !== 'folder'; }).concat(r.files);
    S.msg = r.files.length ? 'Loaded ' + r.files.length + ' file' + (r.files.length === 1 ? '' : 's') + ' from the folder — add anything else, then click “Propose values”.' + (r.skipped.length ? '<br>Skipped (unreadable): ' + r.skipped.map(esc).join(', ') : '') : 'No readable files found in that folder (Word, text, CSV, JSON or HTML, up to two levels deep).';
    paint();
  }
  async function reconnect() {
    var w = WATCH[S.schema.key]; if (!w) return;
    try {
      var p = await w.handle.requestPermission({ mode: 'read' });
      if (p !== 'granted') { S.msg = 'Permission wasn’t granted.'; paint(); return; }
      var nw = await attachWatch(w.key, w.label, w.id, w.ctx, w.handle); await loadFolder(nw);
    } catch (e) { S.msg = 'Couldn’t reconnect: ' + esc(e.message || e); paint(); }
  }

  async function propose() {
    if (S.rec && S.dict) S.dict.stop();
    var inp = totalInput();
    if (!inp.text.trim()) { S.msg = 'Add something first — speak, type, paste or load a file.'; paint(); return; }
    if (!window.NorthAI) { S.msg = 'The AI isn’t available on this page.'; paint(); return; }
    S.phase = 'working'; var tok = ++S.tok; paint();
    try {
      var r = await window.NorthAI.run({ area: 'doc_extract', kind: 'extract', input: inp.text, prompt: buildPrompt(S.schema) });
      if (!S || tok !== S.tok) return;
      if (!r || !r.fields) { S.phase = 'input'; S.msg = 'The AI answered, but not in a form I could read. Try again, or add more detail.'; }
      else { S.proposal = interpret(S.schema, r.fields); S.phase = 'review'; }
    } catch (e) {
      if (!S || tok !== S.tok) return;
      S.phase = 'input';
      if (e && e.cancelled) S.msg = '';
      else if (e && e.notConfigured) S.msg = 'No AI is set up for this organisation yet — an admin can add one in Configuration → AI &amp; agents.';
      else S.msg = 'Couldn’t read that: ' + esc((e && e.message) || e);
    }
    paint();
  }
  function readEditor(def, id) { var el = document.getElementById(id); return el ? normVal(def, el.value) : undefined; }
  function apply() {
    var sc = S.schema, P = S.proposal, nF = 0, nA = 0, nU = 0, bad = 0;
    if (sc.canEdit && !sc.canEdit()) { toast('Your role is view-only.'); return; }
    P.fields.forEach(function (r, i) {
      var cb = document.getElementById('aflC_f' + i); if (!cb || !cb.checked) return;
      var v = readEditor(r.def, 'aflV_f' + i); if (v === undefined) { bad++; return; }
      try {
        if (r.def.type === 'html') {
          var cur = r.def.get(), stamp = new Date().toLocaleDateString('en-AU');
          r.def.set((htmlToPlain(cur) ? cur + '<p><b>Imported ' + esc(stamp) + '</b></p>' : '') + htmlFromText(v));
        } else r.def.set(v);
        nF++;
      } catch (e) { console.warn('aiFill set failed', r.def.key, e); bad++; }
    });
    P.lists.forEach(function (L, li) {
      L.items.forEach(function (it, ii) {
        var cb = document.getElementById('aflC_l' + li + '_' + ii); if (!cb || !cb.checked) return;
        try { if (it.kind === 'add') { L.def.add(it.obj); nA++; } else { L.def.update(it.row, it.obj); nU++; } }
        catch (e) { console.warn('aiFill list apply failed', L.def.key, e); bad++; }
      });
    });
    var summary = nF + ' field' + (nF === 1 ? '' : 's') + (nA ? ', ' + nA + ' added' : '') + (nU ? ', ' + nU + ' updated' : '');
    close();
    try { if (sc.after) sc.after(); if (sc.onApplied) sc.onApplied(summary); } catch (e) { console.warn('aiFill after failed', e); }
    toast('Applied from brief: ' + summary + (bad ? ' (' + bad + ' skipped)' : '') + '. Please double-check them.');
  }
  function close() { if (S && S.dict) S.dict.stop(); S = null; document.body.classList.remove('afl-open'); var ov = document.getElementById('aflModal'); if (ov) ov.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(id, ctx) {
    var b = REG[id]; if (!b) { toast('Fill from brief isn’t set up for this page.'); return; }
    var sc; try { sc = b(ctx || {}); } catch (e) { console.warn('aiFill schema failed', e); toast('Couldn’t open Fill from brief here.'); return; }
    if (!sc) { toast('Nothing to fill here yet.'); return; }
    if (sc.canEdit && !sc.canEdit()) { toast('Your role is view-only.'); return; }
    ensureCss(); close();
    var chip = document.getElementById('aflChip'); if (chip && chip.getAttribute('data-key') === sc.key) chip.remove();
    S = { id: id, ctx: ctx || {}, schema: sc, phase: 'input', text: '', files: [], msg: '', tok: 0, interim: '', rec: false, dict: null, proposal: null, autoPropose: !!(ctx && ctx.autoMic) };
    document.body.classList.add('afl-open');
    var ov = document.createElement('div'); ov.className = 'afl-ov'; ov.id = 'aflModal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="afl-box"></div>'; document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-a]') : null; if (!t || !S) return;
      var a = t.getAttribute('data-a');
      if (a === 'close') close(); else if (a === 'mic') toggleMic(); else if (a === 'folder') pickFolder(); else if (a === 'propose') propose();
      else if (a === 'back') { S.phase = 'input'; paint(); } else if (a === 'apply') apply(); else if (a === 'cancelwork') { S.tok++; S.phase = 'input'; paint(); }
      else if (a === 'rmfile') { S.files.splice(parseInt(t.getAttribute('data-i'), 10), 1); paint(); }
      else if (a === 'readfolder') { var w = WATCH[S.schema.key]; if (w) loadFolder(w).catch(function (er) { S.msg = esc(er.message || er); paint(); }); }
      else if (a === 'unwatch') { stopWatch(S.schema.key, true); S.files = S.files.filter(function (f) { return f.from !== 'folder'; }); S.msg = 'Stopped watching that folder.'; paint(); }
      else if (a === 'reconnect') reconnect();
    });
    ov.addEventListener('dragover', function (e) { e.preventDefault(); });
    ov.addEventListener('drop', function (e) { e.preventDefault(); if (S && S.phase === 'input' && e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
    document.addEventListener('keydown', onKey);
    paint();
    if (ctx && ctx.autoMic && speechSupported()) toggleMic();
    /* remembered folder for this record? (per browser) */
    if (dirSupported() && !WATCH[sc.key]) {
      loadHandle(sc.key).then(function (h) {
        if (h && S && S.schema.key === sc.key) return attachWatch(sc.key, sc.title, id, ctx || {}, h).then(function () { if (S && S.schema.key === sc.key) paint(); });
      }).catch(function () { });
    }
  }
  /* ---------------- universal "talk to this screen" mode ----------------
     No per-page wiring: scan the editable controls that are visible right now (inside an open dialog if there is
     one, else the page's #main), describe each by its label / table column / table row, and hand that to the same
     review flow as a normal schema. Limits (honest): it can only change fields that are ON SCREEN -- it cannot add
     table rows or create records; pages with rich custom widgets (drag grids, canvases) are not editable this way.
     Values are set like a person typing (native value + input/change events), so each page's own handlers, role
     checks, audit and saving run; each set is then re-read from the screen and counted as skipped if the page
     did not keep it (e.g. a view-only role). */
  var SKIP_NAME = /pass(word)?|secret|token|api[-_ ]?key|credential|card|cvv|iban|ssn|otp|2fa|private[-_ ]?key/i;
  var MAX_SCREEN_FIELDS = 120;
  function visibleEl(el) { return !!(el.offsetParent || (el.getClientRects && el.getClientRects().length)); }
  function txt(n) { return (n && n.textContent || '').replace(/\s+/g, ' ').trim(); }
  function screenScope() {
    var dl = [].slice.call(document.querySelectorAll('[role=dialog],.modal')).filter(function (d) { return !d.closest('#aflModal,#naiModal,.asst') && visibleEl(d); });
    if (dl.length) return dl[dl.length - 1];
    return document.getElementById('main') || document.querySelector('main') || document.body;
  }
  function ctrlType(el) {
    var tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') ? 'html' : null;
    if (tag === 'select') return 'select'; if (tag === 'textarea') return 'longtext';
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'number') return 'number'; if (t === 'date') return 'date';
    return /^(text|email|tel|url)$/.test(t) ? 'text' : null;
  }
  function headerForCell(td) {
    var tr = td.closest('tr'), table = td.closest('table'); if (!tr || !table) return '';
    var idx = [].indexOf.call(tr.children, td), ths = table.querySelectorAll('thead th');
    if (!ths.length) { var fr = table.querySelector('tr'); ths = fr && fr !== tr ? fr.children : []; }
    return ths[idx] ? txt(ths[idx]) : '';
  }
  function describeCtrl(el) {
    var lab = el.getAttribute('aria-label') || '';
    if (!lab && el.id) { try { var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) lab = txt(l); } catch (e) { /* bad id */ } }
    if (!lab) { var wl = el.closest('label'); if (wl) { var c = wl.cloneNode(true); c.querySelectorAll('input,select,textarea,button').forEach(function (n) { n.remove(); }); lab = txt(c); } }
    var td = el.closest('td,th');
    if (!lab && !td) {
      var p = el, hops = 0;
      while (p && !lab && hops < 3) {
        for (var s = p.previousElementSibling; s && !lab; s = s.previousElementSibling) { if (!s.matches('.card,.modal,.mask,table,section,form,ul,ol,h1,h2,h3') && !s.querySelector('input,select,textarea,div,table,p,h1,h2,h3,[contenteditable]')) { var t = txt(s); if (t && t.length <= 60) lab = t; } }
        p = p.parentElement; hops++;
        if (p && p.matches('td,th,tr,.card,.bd,#main,form,.modal,.mask,[role=dialog]')) break;
      }
    }
    var row = '';
    if (td) {
      lab = lab || headerForCell(td);
      var tr = td.closest('tr'), body = tr.parentElement, n = [].indexOf.call(body.children, tr) + 1, key = '';
      [].slice.call(tr.querySelectorAll('input[type=text],input:not([type]),textarea,td')).some(function (c) { var v = (c.value != null && c.tagName !== 'TD') ? c.value : txt(c); if (v && v.length <= 40) { key = v; return true; } return false; });
      row = 'row ' + n + (key ? ' (' + key + ')' : '');
    }
    lab = lab || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || el.id || 'field';
    var card = el.closest('.card'), h = card && card.querySelector('h3'), sec = h ? txt(h).slice(0, 50) : '';
    return [sec, row, lab.slice(0, 60)].filter(Boolean).join(' › ');
  }
  function scanScreen() {
    var scope = screenScope(), out = [], seen = {}, els = scope.querySelectorAll('input,select,textarea,[contenteditable]');
    for (var i = 0; i < els.length && out.length < MAX_SCREEN_FIELDS; i++) {
      var el = els[i];
      if (el.closest('#aflModal,#naiModal,.asst,.afl-chip,#aflFab,[hidden]') || el.disabled || el.readOnly) continue;
      var type = ctrlType(el); if (!type || !visibleEl(el)) continue;
      if ((el.getAttribute('type') || '') === 'search' || el.getAttribute('role') === 'search' || /search|filter/i.test(el.getAttribute('placeholder') || '')) continue;
      var label = describeCtrl(el);
      if (SKIP_NAME.test((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('autocomplete') || '') + ' ' + label)) continue;
      var n = seen[label] = (seen[label] || 0) + 1, f = { el: el, sig: label + ' #' + n, label: label, type: type };
      if (type === 'select') f.options = [].slice.call(el.options).filter(function (o) { return o.value !== '' && !o.disabled; }).map(function (o) { return { value: o.value, label: txt(o) || o.value }; });
      out.push(f);
    }
    return out;
  }
  function locateSig(sig) { var all = scanScreen(); for (var i = 0; i < all.length; i++) if (all[i].sig === sig) return all[i]; return null; }
  function ctrlValue(f) { return f.type === 'html' ? f.el.innerHTML : (f.el.value == null ? '' : f.el.value); }
  function fire(el, t) { el.dispatchEvent(new Event(t, { bubbles: true })); }
  function sameLoose(a, b) {
    var x = String(a == null ? '' : a).trim(), y = String(b == null ? '' : b).trim();
    if (x.toLowerCase() === y.toLowerCase()) return true;
    var nx = parseFloat(x.replace(/[$,%\s]/g, '')), ny = parseFloat(y.replace(/[$,%\s]/g, ''));
    return isFinite(nx) && isFinite(ny) && nx === ny;
  }
  function setScreenField(f, v) {
    var cur = f.el.isConnected ? f : locateSig(f.sig); if (!cur || !cur.el.isConnected) throw new Error('field no longer on screen');
    var el = cur.el;
    if (f.type === 'html') { el.innerHTML = v; fire(el, 'input'); try { el.dispatchEvent(new FocusEvent('blur')); } catch (e) { /* ignore */ } return; }
    if (f.type === 'select') { el.value = v; if (el.value !== String(v)) throw new Error('option not available'); }
    else { var d = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value'); d.set.call(el, String(v)); }
    fire(el, 'input'); fire(el, 'change');
    var after = locateSig(f.sig);   /* the page may have re-rendered; check what is on screen now */
    if (!after || !sameLoose(ctrlValue(after), v)) throw new Error('the page did not keep the value');
  }
  function screenTitle() { var h = document.querySelector('#main h1'); return (h && txt(h)) || document.title || 'this page'; }
  function universalSchema() {
    var found = scanScreen(); if (!found.length) return null;
    var page = screenTitle();
    return {
      key: 'screen:' + location.pathname + ':' + page, title: 'This screen — ' + page, universal: true,
      intro: 'The fields are the editable inputs currently visible on a web page; each label shows where it sits (section › table row (row name) › column). The INPUT is usually a spoken or typed instruction such as "set the Hall B pax to 40 and mark it confirmed", or a short brief. Change ONLY fields the INPUT refers to; use the [currently] values to tell rows apart.',
      canEdit: function () { return !(typeof window.isViewer === 'function' && window.isViewer()); },
      fields: found.map(function (f, i) {
        return {
          key: 'f' + (i + 1), label: f.label, type: f.type, options: f.options, ctx: f.type === 'html' ? htmlToPlain(ctrlValue(f)).slice(0, 40) : ctrlValue(f),
          get: function () { var c = f.el.isConnected ? f : locateSig(f.sig); return c ? ctrlValue(c) : ''; },
          set: function (v) { setScreenField(f, v); }
        };
      }),
      lists: []
    };
  }
  function openScreen() {
    if (!window.NorthAI) { toast('The AI isn’t available on this page.'); return; }
    open('__screen__', { autoMic: true });
  }
  /* floating button, shown once a module has drawn its main area; plus the same help entry on every module */
  var FAQ_ENTRY = { q: 'Can I talk to a screen and have it fill in?', a: 'Yes. Click “🎙 Talk to this screen” (bottom right), say what you want — for example “set Hall B pax to 40 and mark it confirmed” — then stop. North lists the fields it would change, current versus proposed; tick what you want and click Apply. It only changes fields that are visible on screen (it cannot add rows or create records), values that would replace something already filled in start unticked, and a field the page refuses (for example a view-only role) is reported as skipped. Speech works in Chrome and Edge. The field names and current values on screen are sent to your organisation’s chosen AI.' };
  function initUniversal() {
    if (window.__aflUniversal || window.top !== window) return; window.__aflUniversal = true;
    var tries = 0, faqDone = false, b = null;
    var tick = setInterval(function () {
      if (!window.NorthAI) { if (++tries > 40) clearInterval(tick); return; }
      if (!b) {
        ensureCss(); b = document.createElement('button'); b.id = 'aflFab'; b.type = 'button'; b.className = 'afl-fab'; b.hidden = true;
        b.textContent = '🎙 Talk to this screen'; b.title = 'Speak or type what you want changed on this screen; you review every change before it is applied';
        b.onclick = openScreen; document.body.appendChild(b);
      }
      var m = document.getElementById('main'), show = !!(m && m.firstElementChild && m.getClientRects().length);
      if (b.hidden === show) b.hidden = !show;
      if (!faqDone) { try { if (typeof HELP_FAQ !== 'undefined' && Array.isArray(HELP_FAQ)) { if (!HELP_FAQ.some(function (x) { return x && x.q === FAQ_ENTRY.q; })) HELP_FAQ.push(FAQ_ENTRY); faqDone = true; } } catch (e) { faqDone = true; } }
    }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUniversal); else initUniversal();

  function register(id, builder) { REG[id] = builder; }
  register('__screen__', universalSchema);

  window.NorthAIFill = {
    register: register, open: open, openScreen: openScreen, fileToText: fileToText, createDictation: createDictation, speechSupported: speechSupported,
    FILE_ACCEPT: FILE_ACCEPT, dirSupported: dirSupported,
    _test: { scanScreen: scanScreen, universalSchema: universalSchema, zipEntryText: zipEntryText, docxText: docxText, buildPrompt: buildPrompt, interpret: interpret, normVal: normVal, htmlFromText: htmlFromText }
  };
})();
