/* shared/alecReview.js (2026-10-08, Stef: "the ability for the AI to speak and tell me what is on screen and make
   recommendations, alerts on what is working or not, and possible activities / campaigns to help fix an issue / shortfall").

   Add-on for the Ask Alec panel. shared/askAlec.js loads this file from its own folder and attaches it with
   NorthAskAlec.extend(); if this file is missing or fails, Ask Alec works exactly as before.

   What it adds to the panel:
     1. Alert chips  -- counts of what North ITSELF already marks red / amber / green / info on the visible screen
                        (.pill.bad/.warn/.ok, .note.w/.b/.g) plus any module rules (cfg.alerts). No AI call, no cost.
                        Click a chip to list the items; click an item to scroll to it.
     2. "What's on screen" -- instant spoken + written briefing built from those flags (no AI call).
     3. "Review this screen" -- one AI call (same pipe, same org gate, same data limits as Ask Alec chat) returning a
                        structured read: what is working, what needs attention, recommended activities / campaigns.
     4. Read aloud   -- browser text-to-speech (sentence-chunked, pause / stop, voice + speed + auto-read saved per
                        browser). An organisation's own voice provider can be plugged in with
                        NorthAlecReview.setVoiceProvider({name, speak: async (text) => audioUrl}) (Step 3).
     5. "Create draft" on activity / campaign recommendations when the module supplies cfg.createDraft(rec, review);
                        review-first -- this file never creates anything itself.

   Optional per-module config (all passed to NorthAskAlec.init):
     reviewFocus : string  extra guidance for the AI review ("compare plan to target, check pipeline coverage ...")
     alerts      : () => [{level:'bad'|'warn'|'ok'|'info', text, ctx?}]  module rules computed from its own data
     createDraft : (rec, review) => void   opens the module's own create flow pre-filled for the user to review */
(function () {
  'use strict';
  var A = window.NorthAskAlec;
  if (!A || !A._x || window.NorthAlecReview) return;
  var X = A._x, S = X.S, esc = X.esc;

  var CSS = [
    '.rv-bar{flex:0 0 auto;padding:8px 12px 6px;border-bottom:1px solid var(--line);background:var(--surface)}',
    '.rv-bar [hidden]{display:none !important}',
    '.rv-btns{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.rv-btns .btn{white-space:nowrap}',
    '.rv-btns .sp{flex:1}',
    '.rv-flags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}',
    '.rv-flags:empty{display:none}',
    '.rv-chip{border:1px solid var(--line);background:#fff;border-radius:12px;padding:2px 9px;font-size:11.5px;cursor:pointer;color:var(--ink-2)}',
    '.rv-chip.bad{border-color:var(--bad);background:var(--bad-bg);color:var(--bad)}',
    '.rv-chip.warn{border-color:var(--warn);background:var(--warn-bg);color:var(--warn)}',
    '.rv-chip.ok{border-color:var(--ok,#1a7f4b);background:var(--ok-bg,#e7f6ee);color:var(--ok,#1a7f4b)}',
    '.rv-chip[aria-expanded="true"]{box-shadow:0 0 0 2px rgba(0,0,0,.12)}',
    '.rv-flaglist{margin-top:7px;max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:var(--r-sm);background:#fff}',
    '.rv-fi{display:flex;gap:7px;align-items:flex-start;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;padding:5px 8px;font-size:11.5px;color:var(--ink-2);cursor:pointer}',
    '.rv-fi:last-child{border-bottom:0}.rv-fi:hover{background:var(--canvas)}.rv-fi[disabled]{cursor:default}',
    '.rv-dot{flex:0 0 8px;height:8px;border-radius:50%;margin-top:4px;background:var(--ink-3)}',
    '.rv-dot.bad{background:var(--bad)}.rv-dot.warn{background:var(--warn)}.rv-dot.ok{background:var(--ok,#1a7f4b)}',
    '.rv-fi .cx{color:var(--ink-3)}',
    '.rv-voice{margin-top:7px;border:1px solid var(--line);border-radius:var(--r-sm);background:#fff;padding:8px;font-size:11.5px;color:var(--ink-2);display:grid;gap:6px}',
    '.rv-voice label{display:flex;align-items:center;gap:6px}.rv-voice select,.rv-voice input[type=range]{flex:1;min-width:0}',
    '.rv-voice .note-s{color:var(--ink-3);font-size:11px}',
    '.rv-flash{outline:3px solid var(--warn);outline-offset:2px;transition:outline-color .3s}',
    '.asst-msg.rv{max-width:98%;white-space:normal}',
    '.rv-head{font-weight:600;font-size:13px;margin-bottom:6px;color:var(--ink)}',
    '.rv-sec{margin-top:8px;border-left:3px solid var(--line);padding-left:8px}',
    '.rv-sec.ok{border-color:var(--ok,#1a7f4b)}.rv-sec.bad{border-color:var(--bad)}.rv-sec.rec{border-color:var(--nav)}',
    '.rv-sec h4{margin:0 0 3px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3)}',
    '.rv-it{margin:0 0 6px;font-size:12.5px;line-height:1.45}',
    '.rv-it .ev{display:block;color:var(--ink-3);font-size:11.5px}',
    '.rv-it .ti{font-weight:600}',
    '.rv-tag{display:inline-block;font-size:10.5px;border-radius:9px;padding:0 7px;margin-left:5px;border:1px solid var(--line);color:var(--ink-2);vertical-align:1px}',
    '.rv-tag.bad{border-color:var(--bad);color:var(--bad)}.rv-tag.warn{border-color:var(--warn);color:var(--warn)}',
    '.rv-act{margin-top:4px;display:flex;gap:6px;flex-wrap:wrap}',
    '.rv-foot{margin-top:8px;font-size:10.5px;color:var(--ink-3)}',
    '.rv-mini{margin-top:6px}',
    '.rv-mini button,.rv-linkbtn{border:0;background:none;color:var(--nav);font-size:11.5px;cursor:pointer;padding:0;text-decoration:underline}'
  ].join('\n');

  var R = { provider: null, flags: [], flagsOpen: false, voiceOpen: false, voices: [] };
  var T = { gen: 0, chunks: [], i: 0, id: null, state: 'idle', audio: null, page: '', providerFailed: false };

  function C() { return X.cfg() || {}; }
  function key(k) { return (C().lsKey || 'north') + '_alec_' + k; }
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
  function $(id) { return document.getElementById(id); }

  /* ---------------------------------------------------------------- on-screen flags (rule-based, no AI) */
  function ctxFor(el) {
    var tr = el.closest('tr');
    if (tr && tr.cells && tr.cells.length) {
      var parts = [];
      for (var i = 0; i < tr.cells.length && parts.length < 2; i++) {
        var c = tr.cells[i]; if (c.contains(el)) continue;
        var t = clean(c.textContent); if (t && t.length <= 60) parts.push(t);
      }
      if (parts.length) return parts.join(' / ');
    }
    var kpi = el.closest('.kpi');
    if (kpi) { var k = kpi.querySelector('.k'); if (k) return clean(k.textContent); }
    var card = el.closest('.card');
    if (card) { var h = card.querySelector('h1,h2,h3,h4'); if (h) return clean(h.textContent); }
    return '';
  }
  function collectFlags() {
    var main = $('main'), out = [], seen = {};
    if (main) {
      main.querySelectorAll('.pill.bad,.pill.warn,.pill.ok,.note.w,.note.b,.note.g').forEach(function (el) {
        if (!visible(el) || el.closest('#asstPanel')) return;
        var cl = el.classList, isNote = cl.contains('note');
        var level = cl.contains('bad') ? 'bad' : (cl.contains('warn') || (isNote && cl.contains('w'))) ? 'warn' : (cl.contains('ok') || (isNote && cl.contains('g'))) ? 'ok' : 'info';
        var text = clean(el.textContent); if (!text) return; if (text.length > 170) text = text.slice(0, 167) + '...';
        var ctx = isNote ? '' : ctxFor(el);
        var k = level + '|' + ctx + '|' + text; if (seen[k]) return; seen[k] = 1;
        out.push({ level: level, text: text, ctx: ctx, el: el });
      });
    }
    try {
      var extra = C().alerts && C().alerts();
      (extra || []).forEach(function (a) { if (a && a.text) out.push({ level: /^(bad|warn|ok|info)$/.test(a.level) ? a.level : 'info', text: clean(a.text), ctx: clean(a.ctx || ''), el: null }); });
    } catch (e) { console.warn('Ask Alec alerts()', e); }
    var order = { bad: 0, warn: 1, info: 2, ok: 3 };
    out.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return out;
  }
  function counts(fl) { var c = { bad: 0, warn: 0, ok: 0, info: 0 }; fl.forEach(function (f) { c[f.level]++; }); return c; }
  function flagLine(f) { return (f.ctx ? f.ctx + ': ' : '') + f.text; }

  function renderFlags() {
    R.flags = collectFlags();
    var box = $('rvFlags'); if (!box) return;
    var c = counts(R.flags), h = '';
    var chip = function (cls, n, label) { return n ? '<button type="button" class="rv-chip ' + cls + '" data-rv-chip="1" aria-expanded="' + (R.flagsOpen ? 'true' : 'false') + '" title="Show what is flagged on this screen">' + n + ' ' + label + '</button>' : ''; };
    h += chip('bad', c.bad, 'need attention') + chip('warn', c.warn, 'to watch') + chip('ok', c.ok, 'on track');
    if (!h && c.info) h = chip('', c.info, 'note' + (c.info > 1 ? 's' : ''));
    box.innerHTML = h;
    renderFlagList();
  }
  function renderFlagList() {
    var l = $('rvFlagList'); if (!l) return;
    l.hidden = !(R.flagsOpen && R.flags.length);
    if (l.hidden) return;
    var shown = R.flags.slice(0, 18);
    l.innerHTML = shown.map(function (f, i) {
      return '<button type="button" class="rv-fi" data-rv-flag="' + i + '"' + (f.el ? '' : ' disabled') + '><span class="rv-dot ' + f.level + '"></span><span>' +
        (f.ctx ? '<span class="cx">' + esc(f.ctx) + ' &mdash; </span>' : '') + esc(f.text) + '</span></button>';
    }).join('') + (R.flags.length > shown.length ? '<div class="rv-fi" style="cursor:default">+' + (R.flags.length - shown.length) + ' more not listed</div>' : '');
  }
  function gotoFlag(i) {
    var f = R.flags[i]; if (!f || !f.el || !document.body.contains(f.el)) return;
    try { f.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { f.el.scrollIntoView(); }
    var t = f.el.closest('tr,.kpi,.card') || f.el; t.classList.add('rv-flash');
    setTimeout(function () { t.classList.remove('rv-flash'); }, 1800);
  }

  /* instant, free briefing from the flags */
  function briefingText() {
    var fl = collectFlags(), c = counts(fl), pg = X.pageInfo().label || 'this screen', parts = [];
    parts.push('You are on ' + pg + ' in ' + (C().moduleLabel || 'North') + '.');
    var say = function (arr, lead) { if (!arr.length) return; parts.push(lead + ' ' + arr.slice(0, 5).map(function (f) { return flagLine(f).replace(/[.!?]+$/, ''); }).join('. ') + (arr.length > 5 ? '. Plus ' + (arr.length - 5) + ' more.' : '.')); };
    var by = function (lv) { return fl.filter(function (f) { return f.level === lv; }); };
    if (c.bad) say(by('bad'), c.bad + ' ' + (c.bad === 1 ? 'item needs' : 'items need') + ' attention:');
    if (c.warn) say(by('warn'), c.warn + ' to watch:');
    if (c.ok) parts.push(c.ok + (c.ok === 1 ? ' item is' : ' items are') + ' marked on track.');
    if (!c.bad && !c.warn && !c.ok) parts.push('Nothing on this screen is flagged red, amber or green by North itself.');
    parts.push('For what is working, what is not, and suggested activities or campaigns, choose Review this screen.');
    return parts.join(' ');
  }
  function brief() {
    if (!S.open) X.open();
    var t = briefingText();
    S.msgs.push({ role: 'user', text: 'What’s on this screen?' });
    S.msgs.push({ role: 'assistant', kind: 'brief', text: t });
    X.renderLog();
    speak(t, S.msgs.length - 1);
  }

  /* ---------------------------------------------------------------- AI review */
  function reviewPrompt() {
    var cfg = C();
    return (cfg.systemPrompt ? cfg.systemPrompt + '\n\n(The output format below overrides any earlier formatting instruction.)\n\n' : '') +
      'You are Alec, a GTM and marketing analyst built into North’s ' + (cfg.moduleLabel || '') + ' module. Review the screen the user is looking at and ' +
      'respond with ONLY one JSON object, no markdown fences and no text outside it, in exactly this shape:\n' +
      '{"headline":"one sentence overall read","working":[{"point":"what is working","evidence":"the exact figure or label seen on screen"}],' +
      '"attention":[{"severity":"high|medium|low","issue":"what is off","evidence":"exact figure or label seen","why":"one line on the impact"}],' +
      '"recommendations":[{"title":"short action name","type":"activity|campaign|process|data","detail":"what to do and why, 1-2 sentences","fixes":"which issue it addresses","channel":"optional","timing":"optional"}]}\n' +
      'Rules: use ONLY the context given -- never invent numbers, names or records; every evidence field must quote something visible in the context; ' +
      'at most 4 working, 5 attention and 5 recommendations; recommendations must each address an item in attention and, for type activity or campaign, ' +
      'be concrete enough that a planner could create a draft from the title and detail; if the screen shows no data, say so in the headline and return empty arrays; ' +
      'if something looks off but you cannot tell from this screen, put it under attention with severity low and say what to check. Plain, direct wording.' +
      (cfg.reviewFocus ? '\nFocus for this module: ' + cfg.reviewFocus : '');
  }
  function reviewContext() {
    var fl = collectFlags(), ctx = X.buildContext('Review this screen and reply in the required JSON format.');
    ctx += '\n\nON-SCREEN FLAGS (what North itself marks red/amber/green on this screen):\n' +
      (fl.length ? fl.slice(0, 40).map(function (f) { return '- [' + f.level + '] ' + flagLine(f); }).join('\n') : '(none)');
    return ctx;
  }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function parseReview(t) {
    t = String(t || '').replace(/```(?:json)?/gi, '');
    var a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null;
    var o; try { o = JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
    if (!o || typeof o !== 'object') return null;
    var arr = function (v) { return Array.isArray(v) ? v : []; };
    var rv = {
      headline: str(o.headline),
      working: arr(o.working).slice(0, 5).map(function (w) { return typeof w === 'string' ? { point: w, evidence: '' } : { point: str(w && w.point), evidence: str(w && w.evidence) }; }).filter(function (w) { return w.point; }),
      attention: arr(o.attention).slice(0, 6).map(function (w) { if (typeof w === 'string') return { severity: 'medium', issue: w, evidence: '', why: '' }; var s = str(w && w.severity).toLowerCase(); return { severity: /^(high|medium|low)$/.test(s) ? s : 'medium', issue: str(w && w.issue), evidence: str(w && w.evidence), why: str(w && w.why) }; }).filter(function (w) { return w.issue; }),
      recommendations: arr(o.recommendations).slice(0, 6).map(function (w) { if (typeof w === 'string') return { title: w, type: 'process', detail: '', fixes: '', channel: '', timing: '' }; var ty = str(w && w.type).toLowerCase(); return { title: str(w && w.title), type: /^(activity|campaign|process|data)$/.test(ty) ? ty : 'process', detail: str(w && w.detail), fixes: str(w && w.fixes), channel: str(w && w.channel), timing: str(w && w.timing) }; }).filter(function (w) { return w.title; })
    };
    if (!rv.headline && !rv.working.length && !rv.attention.length && !rv.recommendations.length) return null;
    return rv;
  }
  function dot(s) { s = str(s); return /[.!?]$/.test(s) ? s : s + '.'; }
  function spokenText(rv) {
    var p = [rv.headline ? dot(rv.headline) : ''];
    if (rv.working.length) p.push('What is working: ' + rv.working.map(function (w) { return dot(w.point); }).join(' '));
    if (rv.attention.length) p.push('Needs attention: ' + rv.attention.map(function (w) { return dot(w.issue + (w.why ? ' — ' + w.why : '')); }).join(' '));
    if (rv.recommendations.length) p.push('Recommended: ' + rv.recommendations.map(function (w) { return dot(w.title + (w.detail ? ': ' + w.detail : '')); }).join(' '));
    return p.filter(Boolean).join(' ');
  }
  async function review(isRetry) {
    if (S.busy) return;
    if (!S.open) X.open();
    if (!X.enabled()) { X.renderLog(); return; }
    if (!isRetry) S.msgs.push({ role: 'user', text: 'Review this screen' });
    S.lastQ = 'Review this screen'; S.lastKind = 'review'; S.busy = true; X.renderLog();
    try {
      var out = await X.callAI(reviewPrompt(), reviewContext(), C().taskId);
      var rv = parseReview(out);
      S.msgs.push({ role: 'assistant', kind: 'review', review: rv, text: rv ? spokenText(rv) : String(out) });
      S.lastQ = '';
      if (rv && ls('auto') === '1') { S.busy = false; X.renderLog(); speak(S.msgs[S.msgs.length - 1].text, S.msgs.length - 1); return; }
    } catch (e) { X.pushErr(e); }
    finally { S.busy = false; X.renderLog(); }
  }
  function ls(k, v) { return X.ls(key(k), v); }

  /* ---------------------------------------------------------------- read aloud */
  function ttsOk() { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance); }
  function canSpeak() { return ttsOk() || !!R.provider; }
  function chunkText(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim(); if (!t) return [];
    var sents = t.match(/[^.!?]+[.!?]*\s*/g) || [t], out = [], cur = '';
    var flush = function () { if (cur.trim()) out.push(cur.trim()); cur = ''; };
    sents.forEach(function (s) {
      if (s.length > 200) { flush(); s.split(/,\s+/).forEach(function (piece) { if ((cur + piece).length > 180) flush(); cur += piece + ', '; }); cur = cur.replace(/,\s*$/, '. '); flush(); return; }
      if ((cur + s).length > 180) flush();
      cur += s;
    });
    flush(); return out;
  }
  function loadVoices() {
    if (!ttsOk()) return;
    try { R.voices = (window.speechSynthesis.getVoices() || []).slice(); } catch (e) { R.voices = []; }
    renderVoicePanel();
  }
  function pickVoice() {
    if (!R.voices.length) loadVoices();
    var saved = ls('voice'), v = null;
    if (saved) v = R.voices.filter(function (x) { return x.name === saved; })[0];
    if (!v) {
      var lang = ((navigator.language || 'en') + '').slice(0, 2).toLowerCase();
      var m = R.voices.filter(function (x) { return String(x.lang || '').toLowerCase().indexOf(lang) === 0; });
      v = m.filter(function (x) { return x.default; })[0] || m[0] || null;
    }
    return v;
  }
  function rate() { var r = parseFloat(ls('rate')); return r >= 0.6 && r <= 1.6 ? r : 1; }
  function speak(text, id) {
    stop(true);
    if (!canSpeak()) return false;
    T.gen++; T.chunks = chunkText(text); T.i = 0; T.id = id == null ? null : id; T.state = 'playing'; T.page = X.pageInfo().id; T.providerFailed = false;
    if (!T.chunks.length) { T.state = 'idle'; return false; }
    next(T.gen); updateAudioUI(); return true;
  }
  function next(gen) {
    if (gen !== T.gen) return;
    if (T.i >= T.chunks.length) { T.state = 'idle'; T.id = null; updateAudioUI(); return; }
    var txt = T.chunks[T.i++];
    if (R.provider && !T.providerFailed) {
      Promise.resolve().then(function () { return R.provider.speak(txt); }).then(function (url) {
        if (gen !== T.gen) return;
        var a = new Audio(url); T.audio = a;
        a.onended = function () { next(gen); };
        a.onerror = function () { providerFail(gen, 'the audio could not be played', txt); };
        var pr = a.play(); if (pr && pr.catch) pr.catch(function (e) { providerFail(gen, (e && e.message) || 'playback blocked', txt); });
      }, function (e) { providerFail(gen, (e && e.message) || e, txt); });
      return;
    }
    if (!ttsOk()) { T.state = 'idle'; updateAudioUI(); return; }
    var u = new window.SpeechSynthesisUtterance(txt), v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = rate();
    u.onend = function () { next(gen); };
    u.onerror = function (e) { if (gen !== T.gen) return; var er = e && e.error; if (er === 'interrupted' || er === 'canceled') return; T.state = 'idle'; updateAudioUI(); };
    window.speechSynthesis.speak(u);
  }
  function providerFail(gen, why, txt) {
    if (gen !== T.gen) return;
    T.providerFailed = true;
    S.msgs.push({ role: 'warn', text: 'The organisation voice (' + ((R.provider && R.provider.name) || 'provider') + ') could not speak: ' + (typeof why === 'string' ? why : 'unknown error') + (ttsOk() ? ' — continuing with this browser’s voice.' : '.') });
    X.renderLog();
    if (ttsOk()) { T.i = Math.max(0, T.i - 1); next(gen); } else { T.state = 'idle'; updateAudioUI(); }
  }
  function stop(quiet) {
    T.gen++; T.state = 'idle'; T.id = null;
    try { if (T.audio) { T.audio.pause(); T.audio = null; } } catch (e) {}
    try { if (ttsOk()) window.speechSynthesis.cancel(); } catch (e) {}
    if (!quiet) updateAudioUI();
  }
  function pauseResume() {
    if (T.state === 'playing') { T.state = 'paused'; try { if (T.audio) T.audio.pause(); else if (ttsOk()) window.speechSynthesis.pause(); } catch (e) {} }
    else if (T.state === 'paused') { T.state = 'playing'; try { if (T.audio) T.audio.play(); else if (ttsOk()) window.speechSynthesis.resume(); } catch (e) {} }
    updateAudioUI();
  }
  function speakMsg(i) { var m = S.msgs[i]; if (!m) return; if (T.id === i && T.state !== 'idle') { stop(); return; } speak(m.text, i); }
  function updateAudioUI() {
    var p = $('rvPause'), s = $('rvStop');
    var active = T.state !== 'idle';
    if (p) { p.hidden = !active; p.innerHTML = T.state === 'paused' ? '&#9654;' : '&#9208;'; p.title = T.state === 'paused' ? 'Resume reading' : 'Pause reading'; p.setAttribute('aria-label', p.title); }
    if (s) s.hidden = !active;
    document.querySelectorAll('[data-rv-speak]').forEach(function (b) {
      var on = active && String(T.id) === b.getAttribute('data-rv-speak');
      b.innerHTML = on ? '&#9209; Stop reading' : '&#128266; Read aloud';
    });
    var live = $('rvLive'); if (live) live.textContent = active ? (T.state === 'paused' ? 'Reading paused' : 'Reading aloud') : '';
  }

  /* ---------------------------------------------------------------- voice settings panel */
  function renderVoicePanel() {
    var v = $('rvVoice'); if (!v) return;
    v.hidden = !R.voiceOpen; if (v.hidden) return;
    var cur = ls('voice') || '', opts = '<option value="">Automatic (' + esc(((navigator.language || 'en') + '')) + ')</option>';
    R.voices.forEach(function (x) { opts += '<option value="' + esc(x.name) + '"' + (x.name === cur ? ' selected' : '') + '>' + esc(x.name + ' (' + x.lang + ')') + '</option>'; });
    var h = '';
    if (!ttsOk() && !R.provider) h += '<div class="note-s">This browser can’t read aloud. Chrome, Edge and Safari can; the written review still works.</div>';
    if (ttsOk()) h += '<label>Voice <select id="rvVoiceSel">' + opts + '</select></label>';
    h += '<label>Speed <input id="rvRate" type="range" min="0.7" max="1.5" step="0.1" value="' + rate() + '"> <span id="rvRateV">' + rate().toFixed(1) + '&times;</span></label>';
    h += '<label><input id="rvAuto" type="checkbox"' + (ls('auto') === '1' ? ' checked' : '') + '> Read each review aloud automatically</label>';
    h += '<div class="note-s">' + (R.provider ? 'Voice source: your organisation’s ' + esc(R.provider.name) + ' (falls back to this browser if it fails).' : 'Voice source: this browser. An admin can add the organisation’s own voice provider in Configuration.') + '</div>';
    h += '<div><button type="button" class="btn sm" id="rvTest">Test voice</button></div>';
    v.innerHTML = h;
  }

  /* ---------------------------------------------------------------- message rendering */
  function sec(cls, title, body) { return body ? '<div class="rv-sec ' + cls + '"><h4>' + title + '</h4>' + body + '</div>' : ''; }
  function renderMsg(m, i) {
    if (m.role !== 'assistant') return '';
    var spk = canSpeak() ? '<div class="rv-mini"><button type="button" data-rv-speak="' + i + '">&#128266; Read aloud</button></div>' : '';
    if (m.kind !== 'review' || !m.review) return '<div class="asst-msg a">' + esc(m.text) + spk + '</div>';
    var rv = m.review, h = '<div class="asst-msg a rv">';
    if (rv.headline) h += '<div class="rv-head">' + esc(rv.headline) + '</div>';
    h += sec('ok', 'Working', rv.working.map(function (w) { return '<p class="rv-it">' + esc(w.point) + (w.evidence ? '<span class="ev">' + esc(w.evidence) + '</span>' : '') + '</p>'; }).join(''));
    h += sec('bad', 'Needs attention', rv.attention.map(function (w) {
      var tag = w.severity === 'high' ? 'bad' : w.severity === 'medium' ? 'warn' : '';
      return '<p class="rv-it">' + esc(w.issue) + '<span class="rv-tag ' + tag + '">' + esc(w.severity) + '</span>' + (w.evidence ? '<span class="ev">' + esc(w.evidence) + '</span>' : '') + (w.why ? '<span class="ev">' + esc(w.why) + '</span>' : '') + '</p>';
    }).join(''));
    var canDraft = typeof C().createDraft === 'function';
    h += sec('rec', 'Recommended activities &amp; campaigns', rv.recommendations.map(function (w, ri) {
      var meta = [w.channel, w.timing].filter(Boolean).join(' · ');
      return '<p class="rv-it"><span class="ti">' + esc(w.title) + '</span><span class="rv-tag">' + esc(w.type) + '</span>' + (w.detail ? '<span class="ev" style="color:var(--ink-2)">' + esc(w.detail) + '</span>' : '') +
        (w.fixes ? '<span class="ev">Addresses: ' + esc(w.fixes) + '</span>' : '') + (meta ? '<span class="ev">' + esc(meta) + '</span>' : '') +
        (canDraft && (w.type === 'activity' || w.type === 'campaign') ? '<span class="rv-act"><button type="button" class="btn sm" data-rv-draft="' + i + ':' + ri + '">Create draft&hellip;</button></span>' : '') + '</p>';
    }).join(''));
    h += '<div class="rv-foot">AI read of what is visible on this screen &mdash; check it against your data before acting.</div>' + spk + '</div>';
    return h;
  }

  /* ---------------------------------------------------------------- panel hooks */
  function onBuild(el) {
    if (!$('asstStyleRv')) { var st = document.createElement('style'); st.id = 'asstStyleRv'; st.textContent = CSS; document.head.appendChild(st); }
    if ($('rvBar')) return;
    var bar = document.createElement('div'); bar.id = 'rvBar'; bar.className = 'rv-bar';
    bar.innerHTML = '<div class="rv-btns">' +
      '<button class="btn sm pri" id="rvReview" type="button" title="One AI read of this screen: what is working, what is not, and suggested activities or campaigns">&#10022; Review this screen</button>' +
      '<button class="btn sm" id="rvBrief" type="button" title="Instant spoken and written summary of what North itself has flagged on this screen">&#128266; What’s on screen</button>' +
      '<span class="sp"></span>' +
      '<button class="asst-ib" id="rvPause" type="button" hidden></button>' +
      '<button class="asst-ib" id="rvStop" type="button" hidden aria-label="Stop reading" title="Stop reading">&#9209;</button>' +
      '<button class="asst-ib" id="rvVoiceBtn" type="button" aria-label="Voice settings" aria-expanded="false" title="Voice settings">&#127897;</button></div>' +
      '<div class="rv-flags" id="rvFlags"></div><div class="rv-flaglist" id="rvFlagList" hidden></div><div class="rv-voice" id="rvVoice" hidden></div>' +
      '<div id="rvLive" class="sr-only" aria-live="polite" style="position:absolute;left:-9999px"></div>';
    var log = $('asstLog'); log.parentNode.insertBefore(bar, log);
    bar.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.id === 'rvReview') review();
      else if (t.id === 'rvBrief') brief();
      else if (t.id === 'rvStop') stop();
      else if (t.id === 'rvPause') pauseResume();
      else if (t.id === 'rvVoiceBtn') { R.voiceOpen = !R.voiceOpen; t.setAttribute('aria-expanded', R.voiceOpen ? 'true' : 'false'); loadVoices(); renderVoicePanel(); }
      else if (t.hasAttribute('data-rv-chip')) { R.flagsOpen = !R.flagsOpen; renderFlags(); }
      else if (t.hasAttribute('data-rv-flag')) gotoFlag(+t.getAttribute('data-rv-flag'));
      else if (t.id === 'rvTest') speak('This is the voice Alec will use to read your reviews.', null);
    });
    bar.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'rvVoiceSel') ls('voice', t.value);
      else if (t.id === 'rvRate') { ls('rate', t.value); var rv = $('rvRateV'); if (rv) rv.innerHTML = parseFloat(t.value).toFixed(1) + '&times;'; }
      else if (t.id === 'rvAuto') ls('auto', t.checked ? '1' : '0');
    });
    $('asstLog').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-rv-speak')) speakMsg(+b.getAttribute('data-rv-speak'));
      else if (b.hasAttribute('data-rv-draft')) {
        var p = b.getAttribute('data-rv-draft').split(':'), m = S.msgs[+p[0]], rec = m && m.review && m.review.recommendations[+p[1]];
        if (rec && typeof C().createDraft === 'function') { try { C().createDraft(rec, m.review); } catch (er) { S.msgs.push({ role: 'error', text: 'Couldn’t open the draft: ' + (er && er.message || er) }); X.renderLog(); } }
      }
    });
    if (ttsOk()) { loadVoices(); try { window.speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) {} }
    updateButtons();
  }
  function updateButtons() {
    var r = $('rvReview'), b = $('rvBrief'), on = X.enabled();
    if (r) { r.disabled = !on || !!S.busy; r.title = on ? r.title : 'Ask Alec is turned off for this organization'; }
    if (b) { b.disabled = !!S.busy; if (!canSpeak()) b.innerHTML = '&#128221; What’s on screen'; }
  }
  function onSync() {
    var pid = X.pageInfo().id;
    if (T.state !== 'idle' && T.page && T.page !== pid) stop();
    renderFlags(); updateButtons();
  }

  A.extend({
    onBuild: onBuild, onSync: onSync, renderMsg: renderMsg,
    afterRender: function () { updateButtons(); updateAudioUI(); },
    onClear: function () { stop(); },
    onClose: function () { stop(); },
    review: review
  });
  window.NorthAlecReview = {
    review: review, brief: brief, speak: speak, stop: stop, pause: pauseResume, collectFlags: collectFlags, parseReview: parseReview,
    spokenText: spokenText, chunkText: chunkText,
    setVoiceProvider: function (p) { R.provider = (p && typeof p.speak === 'function') ? p : null; renderVoicePanel(); },
    _R: R, _T: T
  };
})();
