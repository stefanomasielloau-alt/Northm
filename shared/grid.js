// North Strategy module — editable grid layout + widget-swap engine.
// PILOT (2026-09-23): wired up for the Home page only (pageId 'home'),
// on branch feature/strategy-grid-layout. Not yet on main / production.
//
// Ordo.html has no virtual DOM: render() fully replaces #main's innerHTML
// every time ANY app state changes (dropdown, page nav, org switch — see
// render() in the main script). So this can't init GridStack once on page
// load like the static mockup did — it has to be safe to call again every
// time a page's HTML is rebuilt, against a brand-new set of DOM nodes, and
// it always re-applies the last known layout + widget choices so nothing
// appears to reset just because something elsewhere in the app changed.
//
// Two independent, separately-persisted things per box:
//  - WHERE it is / how big (GridStack's own x/y/w/h, saved by gs-id via
//    localStorage key northm_ordo_grid_<pageId>)
//  - WHAT'S in it (the widget id assigned to that box, saved separately via
//    localStorage key northm_ordo_widgets_<pageId>) — swapping content never
//    touches position/size and vice versa.
//
// window.northGridAfterRender(pageId) is called by render() in Ordo.html
// right after it sets #main's innerHTML (wrapped in try/catch there, so a
// bug in here can never break the app's core render loop). Add a branch
// here — not in render() itself — to wire up more pages later; each new
// page just needs its own entry in WIDGET_LIBRARIES plus the matching
// <div class="grid-stack" id="ordo-grid-<pageId>"> + per-box widget
// functions in Ordo.html, following the Home page as the template.
(function () {
  // ---- Widget library: one entry per page, once that page is wired up ----
  // Each widget's fn() returns the box's inner HTML (no .grid-stack-item
  // wrapper) by calling the real render function already used elsewhere in
  // the app, so a swapped-in widget shows real, live data — never a stub.
  var WIDGET_LIBRARIES = {
    home: {
      defaults: { box1: 'kpis', box2: 'quicklinks', box3: 'validations', box4: 'recent' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6 }, // first-ever default only; drag/resize overrides after that
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Gates, regions/pods, campaigns, validations', fn: function () { return window.homeWidgetKpis(); } },
        quicklinks: { label: 'Quick links', hint: 'Shortcuts to Overview / Configure / Plan / Measure pages', fn: function () { return window.homeWidgetQuickLinks(); } },
        validations: { label: 'Validations', hint: 'Blocking and advisory validation messages', fn: function () { return window.homeWidgetValidations(); } },
        recent: { label: 'Recent activity', hint: 'Latest entries from the audit log', fn: function () { return window.homeWidgetRecentActivity(); } }
      }
    }
  };

  var GRIDS = {}; // pageId -> live GridStack instance, kept for the swap handler to resize a box after its content changes

  function gridStorageKey(pageId) { return 'northm_ordo_grid_' + pageId; }
  function widgetStorageKey(pageId) { return 'northm_ordo_widgets_' + pageId; }

  function getWidgetAssignments(pageId) {
    var lib = WIDGET_LIBRARIES[pageId];
    if (!lib) return {};
    var out = Object.assign({}, lib.defaults);
    try {
      var saved = JSON.parse(localStorage.getItem(widgetStorageKey(pageId)) || 'null');
      if (saved && typeof saved === 'object') Object.assign(out, saved);
    } catch (e) {}
    return out;
  }
  function setWidgetAssignment(pageId, boxId, widgetId) {
    var current = getWidgetAssignments(pageId);
    current[boxId] = widgetId;
    try { localStorage.setItem(widgetStorageKey(pageId), JSON.stringify(current)); } catch (e) {}
  }

  function initGrid(pageId, containerId) {
    var gridEl = document.getElementById(containerId);
    if (!gridEl || typeof GridStack === 'undefined') return;

    var items = Array.prototype.slice.call(gridEl.querySelectorAll('.grid-stack-item'));
    items.forEach(function (item) {
      var c = item.querySelector('.grid-stack-item-content');
      if (c && !c.querySelector('.gs-inner')) {
        var wrap = document.createElement('div');
        wrap.className = 'gs-inner';
        var h = document.createElement('div');
        h.className = 'gs-item-handle';
        h.innerHTML = '<span>⠿⠿ drag to move · drag corner to resize</span>' +
          '<button type="button" class="gs-swap-btn" data-gs-swap="' + item.getAttribute('gs-id') + '">⇄ Swap widget</button>';
        wrap.appendChild(h);
        while (c.firstChild) wrap.appendChild(c.firstChild);
        c.appendChild(wrap);
      }
    });

    var grid = GridStack.init({
      column: 12, cellHeight: 12, margin: 10, float: true, animate: false,
      disableDrag: true, disableResize: true,
      handle: '.gs-item-handle', resizable: { handles: 'e, se, s, sw, w' }
    }, gridEl);
    GRIDS[pageId] = grid;

    var settled = false;
    var restoredSaved = false;
    try {
      var saved = JSON.parse(localStorage.getItem(gridStorageKey(pageId)) || 'null');
      if (saved && saved.length) { grid.load(saved); restoredSaved = true; }
    } catch (e) {}
    if (restoredSaved) settled = true;

    if (!restoredSaved) {
      requestAnimationFrame(function () {
        var unitPx = 12 + 10;
        function initialGuess(px) { return Math.max(1, Math.ceil(px / unitPx)); }
        function fitHeight(el, targetPx) {
          var content = el.querySelector('.grid-stack-item-content');
          var h = initialGuess(targetPx);
          for (var guard = 0; guard < 10; guard++) {
            grid.update(el, { h: Math.min(h, 400) });
            var got = content.getBoundingClientRect().height;
            if (got >= targetPx - 1) break;
            h += Math.max(1, Math.ceil((targetPx - got) / unitPx));
          }
          return Math.min(h, 400);
        }
        var els = items;
        var cursorUnits = 0;
        var i = 0;
        while (i < els.length) {
          var el = els[i];
          var w = parseInt(el.getAttribute('gs-w'), 10) || 12;
          var inner = el.querySelector('.gs-inner');
          var innerH = inner ? inner.getBoundingClientRect().height : 0;
          if (w >= 12) {
            grid.update(el, { x: 0, y: cursorUnits, w: w, h: initialGuess(innerH) });
            var h = fitHeight(el, innerH);
            cursorUnits += h;
            i += 1;
          } else {
            var next = els[i + 1];
            var nextInner = next ? next.querySelector('.gs-inner') : null;
            var nextInnerH = nextInner ? nextInner.getBoundingClientRect().height : innerH;
            var rowY = cursorUnits;
            grid.update(el, { x: 0, y: rowY, w: w, h: initialGuess(innerH) });
            var h1 = fitHeight(el, innerH);
            if (next) {
              grid.update(next, { x: 6, y: rowY, w: w, h: initialGuess(nextInnerH) });
              var h2 = fitHeight(next, nextInnerH);
              cursorUnits += Math.max(h1, h2);
            } else {
              cursorUnits += h1;
            }
            i += next ? 2 : 1;
          }
        }
        settled = true;
      });
    }

    grid.on('change', function () {
      if (!settled) return;
      try { localStorage.setItem(gridStorageKey(pageId), JSON.stringify(grid.save(false))); } catch (e) {}
    });

    // Shared, single instance of these two controls lives in the ctxbar (the
    // grey Role/Version/FY/Grain bar), not per-page markup -- moved there
    // 2026-09-23 per Stef's request so they sit inline with those selectors
    // instead of inside each page's own header. window.northGridAfterRender
    // below shows/hides them depending on whether the CURRENT page has a
    // grid wired up at all.
    var toggleBtn = document.getElementById('grid-edit-toggle');
    var resetBtn = document.getElementById('grid-reset');
    var editing = false;
    function setEditing(on) {
      editing = on;
      gridEl.classList.toggle('grid-edit-mode', on);
      grid.enableMove(on);
      grid.enableResize(on);
      if (toggleBtn) {
        toggleBtn.textContent = on ? '✓ Done editing' : '⠿ Edit layout';
        toggleBtn.classList.toggle('active', on);
      }
    }
    if (toggleBtn) toggleBtn.onclick = function () { setEditing(!editing); };
    if (resetBtn) resetBtn.onclick = function () {
      try {
        localStorage.removeItem(gridStorageKey(pageId));
        localStorage.removeItem(widgetStorageKey(pageId));
      } catch (e) {}
      initGrid(pageId, containerId); // re-run in place, no need for a full app render
    };

    gridEl.querySelectorAll('.gs-swap-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        openSwapPicker(pageId, btn.getAttribute('data-gs-swap'));
      };
    });
  }

  // ---- Swap picker modal --------------------------------------------------
  function closeSwapPicker() {
    var m = document.getElementById('gs-swap-modal');
    if (m) m.remove();
  }

  function openSwapPicker(pageId, boxId) {
    closeSwapPicker();
    var lib = WIDGET_LIBRARIES[pageId];
    if (!lib) return;
    var assigned = getWidgetAssignments(pageId);
    var currentId = assigned[boxId];

    var overlay = document.createElement('div');
    overlay.id = 'gs-swap-modal';
    overlay.className = 'gs-swap-overlay';
    overlay.onclick = function (e) { if (e.target === overlay) closeSwapPicker(); };

    var rows = Object.keys(lib.widgets).map(function (wid) {
      var w = lib.widgets[wid];
      var on = wid === currentId;
      return '<button type="button" class="gs-swap-row' + (on ? ' on' : '') + '" data-wid="' + wid + '">' +
        '<span class="gs-swap-row-label">' + w.label + (on ? ' ✓' : '') + '</span>' +
        '<span class="gs-swap-row-hint">' + w.hint + '</span></button>';
    }).join('');

    overlay.innerHTML =
      '<div class="gs-swap-panel">' +
      '<div class="gs-swap-head">Swap this box’s content<button type="button" class="gs-swap-close" aria-label="Close">✕</button></div>' +
      '<div class="gs-swap-list">' + rows +
      '<button type="button" class="gs-swap-row gs-swap-disabled" disabled>' +
      '<span class="gs-swap-row-label">+ Connect an external source</span>' +
      '<span class="gs-swap-row-hint">Not built yet — mocked to show the direction (a URL, a live API, another system). No real connection here.</span>' +
      '</button>' +
      '</div></div>';

    document.body.appendChild(overlay);
    overlay.querySelector('.gs-swap-close').onclick = closeSwapPicker;
    overlay.querySelectorAll('.gs-swap-row[data-wid]').forEach(function (row) {
      row.onclick = function () {
        var wid = row.getAttribute('data-wid');
        setWidgetAssignment(pageId, boxId, wid);
        applyWidgetSwap(pageId, boxId, wid);
        closeSwapPicker();
      };
    });
  }

  function applyWidgetSwap(pageId, boxId, widgetId) {
    var lib = WIDGET_LIBRARIES[pageId];
    var grid = GRIDS[pageId];
    var gridEl = grid ? grid.el : null;
    if (!lib || !gridEl) return;
    var item = gridEl.querySelector('.grid-stack-item[gs-id="' + boxId + '"]');
    if (!item) return;
    var inner = item.querySelector('.gs-inner');
    var handle = inner ? inner.querySelector('.gs-item-handle') : null;
    if (!inner || !handle) return;
    while (inner.lastChild && inner.lastChild !== handle) inner.removeChild(inner.lastChild);
    var w = lib.widgets[widgetId];
    var html = w ? w.fn() : '<div class="card"><div class="bd">Unknown widget.</div></div>';
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    while (tmp.firstChild) inner.appendChild(tmp.firstChild);
    // Content height likely changed — grow/shrink this one box to fit, same
    // measure-and-step approach as the initial layout pass, without moving
    // or resizing any other box.
    requestAnimationFrame(function () {
      var content = item.querySelector('.grid-stack-item-content');
      var targetPx = inner.getBoundingClientRect().height;
      var unitPx = 12 + 10;
      var h = Math.max(1, Math.ceil(targetPx / unitPx));
      for (var guard = 0; guard < 10; guard++) {
        grid.update(item, { h: Math.min(h, 400) });
        var got = content.getBoundingClientRect().height;
        if (got >= targetPx - 1) break;
        h += Math.max(1, Math.ceil((targetPx - got) / unitPx));
      }
    });
  }

  // pageId -> its <div class="grid-stack"> container id. A page appears here
  // only once it's actually been wired up (its own widget functions + grid
  // markup added to Ordo.html) -- this list is also what drives whether the
  // shared Edit layout / Reset layout buttons in the ctxbar show at all.
  var PAGE_GRID_CONTAINERS = {
    home: 'ordo-grid-home'
  };

  window.northGridAfterRender = function (pageId) {
    var toggleBtn = document.getElementById('grid-edit-toggle');
    var resetBtn = document.getElementById('grid-reset');
    var containerId = PAGE_GRID_CONTAINERS[pageId];
    var show = !!containerId;
    if (toggleBtn) toggleBtn.style.display = show ? '' : 'none';
    if (resetBtn) resetBtn.style.display = show ? '' : 'none';
    if (containerId) initGrid(pageId, containerId);
  };
  window.northGetWidgetAssignments = getWidgetAssignments;
})();
