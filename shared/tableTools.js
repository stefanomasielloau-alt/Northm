/* shared/tableTools.js (2026-09-28, Stef: "list page needs filters and sort on columns" across
   Targets, Scoring, Assets and Events).

   Adds click-to-sort headers and a per-column filter row to list tables, with no per-module
   table code to rewrite. Every North module re-renders #main's HTML from scratch on each
   change, so this watches #main and re-applies after every render, keeping each table's sort
   and filter state (in memory, per page + table) so an edit doesn't reset what you were looking at.

   Which tables: any <table> inside #main with a <thead> and at least 3 data rows, or with
   class "tt" (always). Opt out with class "no-tt" on the table. Tables whose rows are
   drag-reorderable (tr[draggable]) are skipped -- sorting would fight the manual order.
   A header cell with no text (action columns) gets no sort/filter. Rows that are a single
   colspan cell (empty-state / total rows) are left at the bottom, untouched.
   Filter: text contains; a column with up to 12 distinct values gets a dropdown instead.
   Values are read from a cell's input/select if it has one, else its text.
   Read-only: this only reorders/hides rows on screen, never changes data. */
(function () {
  var STATE = {};           // key -> {col, dir, filters:{colIdx:value}}
  var applying = false;

  function css() {
    if (document.getElementById('tt-css')) return;
    var s = document.createElement('style'); s.id = 'tt-css';
    s.textContent =
      'th.tt-sortable{cursor:pointer;user-select:none;white-space:nowrap}' +
      'th.tt-sortable:hover{color:var(--ink,#10182B)}' +
      'th .tt-arrow{display:inline-block;margin-left:4px;font-size:9px;opacity:.35}' +
      'th.tt-on .tt-arrow{opacity:1;color:var(--nav,#1F3AC7)}' +
      'tr.tt-filter th{padding:3px 6px;background:var(--canvas-2,#EEF1F6);top:30px;text-transform:none;letter-spacing:0}' +
      'tr.tt-filter input,tr.tt-filter select{width:100%;min-width:60px;box-sizing:border-box;font-size:11px;padding:3px 5px;border:1px solid var(--line,#D8DEE9);border-radius:4px;background:#fff;font-weight:400;color:var(--ink,#10182B)}' +
      'tr.tt-filter input.tt-active,tr.tt-filter select.tt-active{border-color:var(--nav,#1F3AC7);background:#F3F6FF}' +
      '.tt-count{font-size:10.5px;color:var(--ink-3,#6B7489);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px}';
    document.head.appendChild(s);
  }

  function cellVal(td) {
    if (!td) return '';
    var ctl = td.querySelector('select');
    if (ctl) { var o = ctl.options[ctl.selectedIndex]; return (o ? o.text : ctl.value || '').trim(); }
    ctl = td.querySelector('input:not([type=checkbox]):not([type=radio]),textarea');
    if (ctl) return String(ctl.value || '').trim();
    ctl = td.querySelector('input[type=checkbox]');
    if (ctl) return ctl.checked ? 'Yes' : 'No';
    return (td.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function numOf(v) {
    var s = String(v).replace(/[,\s$€£¥%×x]/g, '').replace(/^[A-Z]{3}/, '');
    var m = s.match(/^(-?\d+(?:\.\d+)?)([kKmMbB])?$/);
    if (!m) return null;
    var n = parseFloat(m[1]); var u = (m[2] || '').toLowerCase();
    return n * (u === 'k' ? 1e3 : u === 'm' ? 1e6 : u === 'b' ? 1e9 : 1);
  }
  function dataRows(tbody) {
    return Array.prototype.filter.call(tbody.rows, function (r) {
      return !(r.cells.length === 1 && r.cells[0].colSpan > 1);
    });
  }
  function headerRow(table) {
    var rows = table.tHead.rows;
    for (var i = rows.length - 1; i >= 0; i--) if (!rows[i].classList.contains('tt-filter')) return rows[i];
    return null;
  }
  function keyFor(table, idx) {
    var hr = headerRow(table);
    var sig = hr ? Array.prototype.map.call(hr.cells, function (c) { return (c.getAttribute('data-tt-label') || c.textContent).trim(); }).join('|') : '';
    var page = (window.UI && (UI.page + '/' + (UI.tab || UI.adminTab || ''))) || location.pathname;
    return page + '#' + idx + '#' + sig;
  }

  function enhance(table, idx) {
    if (table.classList.contains('no-tt') || !table.tHead || !table.tBodies.length) return;
    var tbody = table.tBodies[0];
    if (tbody.querySelector('tr[draggable="true"]')) return;
    var rows = dataRows(tbody);
    if (!table.classList.contains('tt') && rows.length < 3) return;
    var hr = headerRow(table); if (!hr) return;
    // header cells must line up 1:1 with body cells (no colspans in the header row)
    if (Array.prototype.some.call(hr.cells, function (c) { return c.colSpan > 1; })) return;
    var key = keyFor(table, idx);
    var st = STATE[key] || (STATE[key] = { col: -1, dir: 1, filters: {} });

    if (!table.dataset.ttDone) {
      table.dataset.ttDone = '1';
      Array.prototype.forEach.call(hr.cells, function (th, ci) {
        var label = th.textContent.trim();
        th.setAttribute('data-tt-label', label);
        if (!label) return;
        th.classList.add('tt-sortable');
        th.title = 'Click to sort';
        var a = document.createElement('span'); a.className = 'tt-arrow'; a.textContent = '▲▼';
        th.appendChild(a);
        th.addEventListener('click', function (e) {
          if (e.target.closest('input,select,button,a')) return;
          if (st.col === ci) { if (st.dir === 1) st.dir = -1; else { st.col = -1; st.dir = 1; } }
          else { st.col = ci; st.dir = 1; }
          apply(table, st);
        });
      });
      // filter row
      var fr = document.createElement('tr'); fr.className = 'tt-filter';
      Array.prototype.forEach.call(hr.cells, function (th, ci) {
        var f = document.createElement('th');
        if (th.getAttribute('data-tt-label')) {
          var vals = {}; var n = 0;
          rows.forEach(function (r) { var v = cellVal(r.cells[ci]); if (v !== '' && !vals[v]) { vals[v] = 1; n++; } });
          var ctl;
          if (n > 0 && n <= 12 && rows.length > n) {
            ctl = document.createElement('select');
            ctl.innerHTML = '<option value="">All</option>' + Object.keys(vals).sort().map(function (v) {
              return '<option>' + v.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>'; }).join('');
            ctl.addEventListener('change', function () { st.filters[ci] = { v: ctl.value, exact: true }; apply(table, st); });
          } else {
            ctl = document.createElement('input'); ctl.placeholder = 'Filter…';
            ctl.addEventListener('input', function () { st.filters[ci] = { v: ctl.value, exact: false }; apply(table, st); });
          }
          var cur = st.filters[ci]; if (cur && cur.v) ctl.value = cur.v;
          ctl.setAttribute('data-tt-col', ci);
          f.appendChild(ctl);
        }
        fr.appendChild(f);
      });
      table.tHead.appendChild(fr);
    }
    apply(table, st);
  }

  function apply(table, st) {
    applying = true;
    try {
      var tbody = table.tBodies[0]; var hr = headerRow(table);
      var all = Array.prototype.slice.call(tbody.rows);
      var rows = dataRows(tbody); var others = all.filter(function (r) { return rows.indexOf(r) < 0; });
      if (!table._ttOrig) table._ttOrig = rows.slice();
      var ordered = table._ttOrig.filter(function (r) { return r.parentNode === tbody; });
      if (st.col >= 0) {
        var ci = st.col;
        var allNum = ordered.every(function (r) { var v = cellVal(r.cells[ci]); return v === '' || v === '—' || numOf(v) !== null; });
        ordered = ordered.slice().sort(function (a, b) {
          var va = cellVal(a.cells[ci]), vb = cellVal(b.cells[ci]);
          var ea = (va === '' || va === '—'), eb = (vb === '' || vb === '—');
          if (ea !== eb) return ea ? 1 : -1;
          if (allNum) return (numOf(va) - numOf(vb)) * st.dir;
          return va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' }) * st.dir;
        });
      }
      var shown = 0;
      ordered.forEach(function (r) {
        var ok = Object.keys(st.filters).every(function (ci) {
          var f = st.filters[ci]; if (!f || !f.v) return true;
          var v = cellVal(r.cells[ci]);
          return f.exact ? v === f.v : v.toLowerCase().indexOf(f.v.toLowerCase()) >= 0;
        });
        r.style.display = ok ? '' : 'none'; if (ok) shown++;
        tbody.appendChild(r);
      });
      others.forEach(function (r) { tbody.appendChild(r); });
      Array.prototype.forEach.call(hr.cells, function (th, i) {
        th.classList.toggle('tt-on', i === st.col);
        var a = th.querySelector('.tt-arrow'); if (a) a.textContent = i === st.col ? (st.dir === 1 ? '▲' : '▼') : '▲▼';
      });
      table.querySelectorAll('tr.tt-filter [data-tt-col]').forEach(function (c) {
        var f = st.filters[c.getAttribute('data-tt-col')]; c.classList.toggle('tt-active', !!(f && f.v));
      });
      var filtered = Object.keys(st.filters).some(function (k) { return st.filters[k] && st.filters[k].v; });
      var cnt = table.querySelector('.tt-count');
      if (filtered) {
        if (!cnt) { cnt = document.createElement('span'); cnt.className = 'tt-count'; var first = hr.cells[0]; if (first) first.appendChild(cnt); }
        cnt.textContent = '(' + shown + ' of ' + ordered.length + ')';
      } else if (cnt) cnt.remove();
    } finally { setTimeout(function () { applying = false; }, 0); }
  }

  function scan() {
    var main = document.getElementById('main'); if (!main) return;
    css();
    Array.prototype.forEach.call(main.querySelectorAll('table'), function (t, i) {
      try { enhance(t, i); } catch (e) { console.warn('tableTools', e); }
    });
  }
  var timer = null;
  function schedule() { if (applying) return; clearTimeout(timer); timer = setTimeout(scan, 30); }
  function start() {
    var main = document.getElementById('main'); if (!main) return setTimeout(start, 200);
    new MutationObserver(function (muts) {
      if (applying) return;
      // ignore our own filter-row / arrow insertions
      if (muts.every(function (m) { return m.target.closest && m.target.closest('tr.tt-filter,th.tt-sortable'); })) return;
      schedule();
    }).observe(main, { childList: true, subtree: true });
    scan();
  }
  window.NorthTableTools = { rescan: scan, state: STATE };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
