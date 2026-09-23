import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

# --- A. add the 5 plan_* entries to WIDGET_LIBRARIES, right after 'drivers' -
old_drivers_entry = """    drivers: {
      defaults: { box1: 'kpis', box2: 'global', box3: 'ratelibrary', box4: 'segmentmult', box5: 'streamcontrib' },
      boxSizes: { box1: 12, box2: 4, box3: 8, box4: 6, box5: 6 }, // first-ever default only; drag/resize overrides after that
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Win target, revenue, deal size, implied wins, end-to-end rate', fn: function () { return window.driversWidgetKpis(); } },
        global: { label: 'Global drivers', hint: 'Editable base assumptions (deal size, revenue, win target, entry volume)', fn: function () { return window.driversWidgetGlobal(); } },
        ratelibrary: { label: 'Rate library', hint: 'Published vs observed rate per gate, with evidence and adopt-observed action', fn: function () { return window.driversWidgetRateLibrary(); } },
        segmentmult: { label: 'Segment rate multipliers', hint: 'Rate multiplier and mix by segment', fn: function () { return window.driversWidgetSegmentMultipliers(); } },
        streamcontrib: { label: 'Stream marketing contribution', hint: 'Marketing-attributed wins by stream', fn: function () { return window.driversWidgetStreamContribution(); } }
      }
    }
  };"""
assert src.count(old_drivers_entry) == 1, "WIDGET_LIBRARIES drivers entry anchor not found exactly once"
new_drivers_entry = """    drivers: {
      defaults: { box1: 'kpis', box2: 'global', box3: 'ratelibrary', box4: 'segmentmult', box5: 'streamcontrib' },
      boxSizes: { box1: 12, box2: 4, box3: 8, box4: 6, box5: 6 }, // first-ever default only; drag/resize overrides after that
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Win target, revenue, deal size, implied wins, end-to-end rate', fn: function () { return window.driversWidgetKpis(); } },
        global: { label: 'Global drivers', hint: 'Editable base assumptions (deal size, revenue, win target, entry volume)', fn: function () { return window.driversWidgetGlobal(); } },
        ratelibrary: { label: 'Rate library', hint: 'Published vs observed rate per gate, with evidence and adopt-observed action', fn: function () { return window.driversWidgetRateLibrary(); } },
        segmentmult: { label: 'Segment rate multipliers', hint: 'Rate multiplier and mix by segment', fn: function () { return window.driversWidgetSegmentMultipliers(); } },
        streamcontrib: { label: 'Stream marketing contribution', hint: 'Marketing-attributed wins by stream', fn: function () { return window.driversWidgetStreamContribution(); } }
      }
    },
    // Planning engine is tab-based (UI.planTab): each tab gets its OWN grid,
    // keyed 'plan_<tab>' rather than just 'plan' -- see the __northGridSubId
    // override in northGridAfterRender below. Layout/widget-assignment
    // localStorage is therefore independent per tab.
    plan_top: {
      defaults: { box1: 'kpis', box2: 'funnel', box3: 'bystream', box4: 'waterfall' },
      boxSizes: { box1: 12, box2: 12, box3: 12, box4: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Gate-by-gate volumes required, top-down', fn: function () { return window.planTopWidgetKpis(); } },
        funnel: { label: 'Funnel (top-down)', hint: 'Funnel chart of volume required at each gate', fn: function () { return window.planTopWidgetFunnel(); } },
        bystream: { label: 'By stream', hint: 'Top-down volumes and ACV broken out by stream', fn: function () { return window.planTopWidgetByStream(); } },
        waterfall: { label: 'Marketing contribution build-up', hint: 'Waterfall of marketing-attributed wins by stream', fn: function () { return window.planTopWidgetWaterfall(); } }
      }
    },
    plan_bot: {
      defaults: { box1: 'kpis', box2: 'entryvolume', box3: 'delivers', box4: 'waterfall' },
      boxSizes: { box1: 12, box2: 4, box3: 8, box4: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Gate-by-gate volumes delivered, bottom-up', fn: function () { return window.planBotWidgetKpis(); } },
        entryvolume: { label: 'Entry volume by stream', hint: 'Editable total entry volume, split by stream mix', fn: function () { return window.planBotWidgetEntryVolume(); } },
        delivers: { label: 'What entry volume delivers', hint: 'Funnel and by-stream table for bottom-up volumes', fn: function () { return window.planBotWidgetDelivers(); } },
        waterfall: { label: 'Marketing contribution build-up (bottom-up)', hint: 'Waterfall of marketing-attributed wins by stream, bottom-up', fn: function () { return window.planBotWidgetWaterfall(); } }
      }
    },
    plan_streamcmp: {
      defaults: { box1: 'table', box2: 'chart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'By stream comparison table', hint: 'Top-down vs bottom-up wins/ACV/gap by stream', fn: function () { return window.planStreamcmpWidgetTable(); } },
        chart: { label: 'Wins by stream chart', hint: 'Line chart of top-down vs bottom-up wins by stream', fn: function () { return window.planStreamcmpWidgetChart(); } }
      }
    },
    plan_rec: {
      defaults: { box1: 'kpis', box2: 'table', box3: 'chart' },
      boxSizes: { box1: 12, box2: 12, box3: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Entry/exit gap between top-down and bottom-up', fn: function () { return window.planRecWidgetKpis(); } },
        table: { label: 'By-gate comparison table', hint: 'Top-down vs bottom-up by gate, with gap % and status', fn: function () { return window.planRecWidgetTable(); } },
        chart: { label: 'Gate comparison chart', hint: 'Line chart of top-down vs bottom-up by gate', fn: function () { return window.planRecWidgetChart(); } }
      }
    },
    plan_phase: {
      defaults: { box1: 'table', box2: 'chart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Phased plan table', hint: 'Volumes phased by seasonality, with entry lead-time', fn: function () { return window.planPhaseWidgetTable(); } },
        chart: { label: 'Seasonality chart', hint: 'Bar chart of seasonality-weighted wins by period', fn: function () { return window.planPhaseWidgetChart(); } }
      }
    }
  };"""
src = src.replace(old_drivers_entry, new_drivers_entry, 1)

# --- B. add the plan_* containers to PAGE_GRID_CONTAINERS --------------------
old_containers = """  var PAGE_GRID_CONTAINERS = {
    home: 'ordo-grid-home',
    drivers: 'ordo-grid-drivers'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """  var PAGE_GRID_CONTAINERS = {
    home: 'ordo-grid-home',
    drivers: 'ordo-grid-drivers',
    plan_top: 'ordo-grid-plan-top',
    plan_bot: 'ordo-grid-plan-bot',
    plan_streamcmp: 'ordo-grid-plan-streamcmp',
    plan_rec: 'ordo-grid-plan-rec',
    plan_phase: 'ordo-grid-plan-phase'
  };"""
src = src.replace(old_containers, new_containers, 1)

# --- C. teach northGridAfterRender to honor a page-set sub-id override ------
old_hook = """  window.northGridAfterRender = function (pageId) {
    var toggleBtn = document.getElementById('grid-edit-toggle');
    var resetBtn = document.getElementById('grid-reset');
    var containerId = PAGE_GRID_CONTAINERS[pageId];
    var show = !!containerId;
    if (toggleBtn) toggleBtn.style.display = show ? '' : 'none';
    if (resetBtn) resetBtn.style.display = show ? '' : 'none';
    if (containerId) initGrid(pageId, containerId);
  };"""
assert src.count(old_hook) == 1, "northGridAfterRender anchor not found exactly once"
new_hook = """  // A page whose grid identity is finer than its top-level pageId (e.g. a
  // tabbed page with one independent grid per tab) sets window.__northGridSubId
  // to the real key just before returning its HTML. We consume it once here
  // so render()'s generic `northGridAfterRender(p.id)` call still works
  // unmodified for every page, tabbed or not.
  window.northGridAfterRender = function (pageId) {
    var effectiveId = pageId;
    if (window.__northGridSubId) { effectiveId = window.__northGridSubId; window.__northGridSubId = null; }
    var toggleBtn = document.getElementById('grid-edit-toggle');
    var resetBtn = document.getElementById('grid-reset');
    var containerId = PAGE_GRID_CONTAINERS[effectiveId];
    var show = !!containerId;
    if (toggleBtn) toggleBtn.style.display = show ? '' : 'none';
    if (resetBtn) resetBtn.style.display = show ? '' : 'none';
    if (containerId) initGrid(effectiveId, containerId);
  };"""
src = src.replace(old_hook, new_hook, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
