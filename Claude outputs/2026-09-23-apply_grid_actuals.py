import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

old_segment_entry = """        observedrate: { label: 'Observed rate by segment', hint: 'Historical observed rate per gate, by segment, with evidence', fn: function () { return window.segmentWidgetObservedRate(); } }
      }
    }
  };"""
assert src.count(old_segment_entry) == 1, "WIDGET_LIBRARIES segment entry anchor not found exactly once"
new_segment_entry = """        observedrate: { label: 'Observed rate by segment', hint: 'Historical observed rate per gate, by segment, with evidence', fn: function () { return window.segmentWidgetObservedRate(); } }
      }
    },
    actuals: {
      defaults: { box1: 'kpis', box2: 'planvsactual', box3: 'trendchart', box4: 'regionchart', box5: 'monthlydetail' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6, box5: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Actual vs plan per gate, plus actual cost', fn: function () { return window.actualsWidgetKpis(); } },
        planvsactual: { label: 'Plan vs actual', hint: 'By-gate plan/actual/variance table with status', fn: function () { return window.actualsWidgetPlanVsActual(); } },
        trendchart: { label: 'Multi-year trend', hint: 'Line chart of actual vs plan across FY25-FY27', fn: function () { return window.actualsWidgetTrendChart(); } },
        regionchart: { label: 'Actual by region', hint: 'Bar chart of actual wins by region', fn: function () { return window.actualsWidgetRegionChart(); } },
        monthlydetail: { label: 'Monthly detail', hint: 'Month-by-month gate volumes, cost and ACV for the selected FY', fn: function () { return window.actualsWidgetMonthlyDetail(); } }
      }
    }
  };"""
src = src.replace(old_segment_entry, new_segment_entry, 1)

old_containers = """    segment: 'ordo-grid-segment'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    segment: 'ordo-grid-segment',
    actuals: 'ordo-grid-actuals'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
