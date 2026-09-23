import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

# --- A. add the 5 insight_* entries to WIDGET_LIBRARIES, right after 'actuals'
old_actuals_entry = """        monthlydetail: { label: 'Monthly detail', hint: 'Month-by-month gate volumes, cost and ACV for the selected FY', fn: function () { return window.actualsWidgetMonthlyDetail(); } }
      }
    }
  };"""
assert src.count(old_actuals_entry) == 1, "WIDGET_LIBRARIES actuals entry anchor not found exactly once"
new_actuals_entry = """        monthlydetail: { label: 'Monthly detail', hint: 'Month-by-month gate volumes, cost and ACV for the selected FY', fn: function () { return window.actualsWidgetMonthlyDetail(); } }
      }
    },
    // Insight is tab-based (UI.insightTab), same treatment as Planning engine:
    // one grid per tab, keyed 'insight_<tab>'.
    insight_season: {
      defaults: { box1: 'indexchart', box2: 'monthlychart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        indexchart: { label: 'Seasonality index chart', hint: 'Bar chart of the seasonality index by fiscal month', fn: function () { return window.insightSeasonWidgetIndexChart(); } },
        monthlychart: { label: 'Monthly actuals by FY', hint: 'Line chart of monthly exit-gate actuals across FY25/FY26', fn: function () { return window.insightSeasonWidgetMonthlyChart(); } }
      }
    },
    insight_vel: {
      defaults: { box1: 'dayschart', box2: 'stagelag' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        dayschart: { label: 'Days to reach each gate', hint: 'Bar chart of cumulative days to each gate', fn: function () { return window.insightVelWidgetDaysChart(); } },
        stagelag: { label: 'Stage lag table', hint: 'Editable median days per stage, with cumulative days and latest entry date', fn: function () { return window.insightVelWidgetStageLag(); } }
      }
    },
    insight_lift: {
      defaults: { box1: 'table', box2: 'heatmap' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Observed rate vs baseline table', hint: 'Observed rate by activity vs the all-activity baseline, with lift and evidence', fn: function () { return window.insightLiftWidgetTable(); } },
        heatmap: { label: 'Rate heat map', hint: 'Heat map of observed rate by activity x gate', fn: function () { return window.insightLiftWidgetHeatmap(); } }
      }
    },
    insight_scen: {
      defaults: { box1: 'table', box2: 'chart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Scenario comparison table', hint: 'Rate multiplier and gate volumes by scenario, vs Forecast', fn: function () { return window.insightScenWidgetTable(); } },
        chart: { label: 'Entry volume by scenario chart', hint: 'Bar chart of entry-gate volume required by scenario', fn: function () { return window.insightScenWidgetChart(); } }
      }
    },
    insight_ready: {
      defaults: { box1: 'sufficiency', box2: 'dimensionality' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        sufficiency: { label: 'Data sufficiency by gate', hint: 'Observation counts and confidence per gate, with what they support', fn: function () { return window.insightReadyWidgetSufficiency(); } },
        dimensionality: { label: 'Dimensionality table', hint: 'Member counts and cumulative addressable cells by dimension', fn: function () { return window.insightReadyWidgetDimensionality(); } }
      }
    }
  };"""
src = src.replace(old_actuals_entry, new_actuals_entry, 1)

# --- B. add the insight_* containers to PAGE_GRID_CONTAINERS -----------------
old_containers = """    actuals: 'ordo-grid-actuals'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    actuals: 'ordo-grid-actuals',
    insight_season: 'ordo-grid-insight-season',
    insight_vel: 'ordo-grid-insight-vel',
    insight_lift: 'ordo-grid-insight-lift',
    insight_scen: 'ordo-grid-insight-scen',
    insight_ready: 'ordo-grid-insight-ready'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
