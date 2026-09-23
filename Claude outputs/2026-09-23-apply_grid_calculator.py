import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

old_dashboard_entry = """        drift: { label: 'Plan drift vs baseline snapshot', hint: 'Target and budget drift since a named snapshot', fn: function () { return window.dashboardWidgetDrift(); } }
      }
    }
  };"""
assert src.count(old_dashboard_entry) == 1, "WIDGET_LIBRARIES dashboard entry anchor not found exactly once"
new_dashboard_entry = """        drift: { label: 'Plan drift vs baseline snapshot', hint: 'Target and budget drift since a named snapshot', fn: function () { return window.dashboardWidgetDrift(); } }
      }
    },
    // Quick calculator: mostly interactive inputs, but the top-down and
    // bottom-up assumption/result pairs render as single boxes (each pair
    // was already one `grid g2` unit in the original layout, sharing state
    // between its two halves) rather than splitting further.
    calculator: {
      defaults: { box1: 'topdown', box2: 'bottomup', box3: 'bystream', box4: 'scenarios', box5: 'reference' },
      boxSizes: { box1: 12, box2: 12, box3: 12, box4: 12, box5: 12 },
      widgets: {
        topdown: { label: 'Top-down: assumptions & result', hint: 'Target wins, deal size, rate and cost/lead -> leads needed, cost, ROI', fn: function () { return window.calcWidgetTopDown(); } },
        bottomup: { label: 'Bottom-up: from volume', hint: 'Given expected entry volume, wins/cost/revenue run forward instead of backward', fn: function () { return window.calcWidgetBottomUp(); } },
        bystream: { label: 'By stream', hint: 'Top-down/bottom-up split across configured streams by mix share', fn: function () { return window.calcWidgetByStream(); } },
        scenarios: { label: 'Scenarios', hint: 'Save, load and remove named calculator scenarios', fn: function () { return window.calcWidgetScenarios(); } },
        reference: { label: 'Reference — real gate chain', hint: 'Blended assumption vs the detailed engine\\'s actual per-gate rates', fn: function () { return window.calcWidgetReference(); } }
      }
    }
  };"""
src = src.replace(old_dashboard_entry, new_dashboard_entry, 1)

old_containers = """    dashboard: 'ordo-grid-dashboard'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    dashboard: 'ordo-grid-dashboard',
    calculator: 'ordo-grid-calculator'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
