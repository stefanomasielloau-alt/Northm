import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

# --- A. add 'activity' to WIDGET_LIBRARIES, right after 'geo' ---------------
old_geo_entry = """        repbreakdown: { label: 'Rep breakdown', hint: 'Editable rep shares for the selected pod', fn: function () { return window.geoWidgetRepBreakdown(); } }
      }
    }
  };"""
assert src.count(old_geo_entry) == 1, "WIDGET_LIBRARIES geo entry anchor not found exactly once"
new_geo_entry = """        repbreakdown: { label: 'Rep breakdown', hint: 'Editable rep shares for the selected pod', fn: function () { return window.geoWidgetRepBreakdown(); } }
      }
    },
    activity: {
      defaults: { box1: 'kpis', box2: 'funnel', box3: 'entrychart', box4: 'costchart' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Wins planned, gate volumes required, total and per-win cost', fn: function () { return window.activityWidgetKpis(); } },
        funnel: { label: 'Activity funnel', hint: 'Editable win target per activity, grouped by route, with cost and capacity fit', fn: function () { return window.activityWidgetFunnel(); } },
        entrychart: { label: 'Entry volume by activity', hint: 'Bar chart of entry-gate volume per activity', fn: function () { return window.activityWidgetEntryChart(); } },
        costchart: { label: 'Cost per win by activity', hint: 'Bar chart of cost per win, activities with tracked cost only', fn: function () { return window.activityWidgetCostChart(); } }
      }
    }
  };"""
src = src.replace(old_geo_entry, new_geo_entry, 1)

# --- B. add 'activity' to PAGE_GRID_CONTAINERS -------------------------------
old_containers = """    geo: 'ordo-grid-geo'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    geo: 'ordo-grid-geo',
    activity: 'ordo-grid-activity'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
