import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

# --- A. add the 'drivers' entry to WIDGET_LIBRARIES, right after 'home' ----
old_home_entry = """    home: {
      defaults: { box1: 'kpis', box2: 'quicklinks', box3: 'validations', box4: 'recent' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6 }, // first-ever default only; drag/resize overrides after that
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Gates, regions/pods, campaigns, validations', fn: function () { return window.homeWidgetKpis(); } },
        quicklinks: { label: 'Quick links', hint: 'Shortcuts to Overview / Configure / Plan / Measure pages', fn: function () { return window.homeWidgetQuickLinks(); } },
        validations: { label: 'Validations', hint: 'Blocking and advisory validation messages', fn: function () { return window.homeWidgetValidations(); } },
        recent: { label: 'Recent activity', hint: 'Latest entries from the audit log', fn: function () { return window.homeWidgetRecentActivity(); } }
      }
    }
  };"""
assert src.count(old_home_entry) == 1, "WIDGET_LIBRARIES home entry anchor not found exactly once"
new_home_entry = """    home: {
      defaults: { box1: 'kpis', box2: 'quicklinks', box3: 'validations', box4: 'recent' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6 }, // first-ever default only; drag/resize overrides after that
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Gates, regions/pods, campaigns, validations', fn: function () { return window.homeWidgetKpis(); } },
        quicklinks: { label: 'Quick links', hint: 'Shortcuts to Overview / Configure / Plan / Measure pages', fn: function () { return window.homeWidgetQuickLinks(); } },
        validations: { label: 'Validations', hint: 'Blocking and advisory validation messages', fn: function () { return window.homeWidgetValidations(); } },
        recent: { label: 'Recent activity', hint: 'Latest entries from the audit log', fn: function () { return window.homeWidgetRecentActivity(); } }
      }
    },
    drivers: {
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
src = src.replace(old_home_entry, new_home_entry, 1)

# --- B. add 'drivers' to PAGE_GRID_CONTAINERS --------------------------------
old_containers = """  var PAGE_GRID_CONTAINERS = {
    home: 'ordo-grid-home'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """  var PAGE_GRID_CONTAINERS = {
    home: 'ordo-grid-home',
    drivers: 'ordo-grid-drivers'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
