import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

# --- A. add 'geo' to WIDGET_LIBRARIES, right after the plan_phase entry -----
old_plan_phase_entry = """    plan_phase: {
      defaults: { box1: 'table', box2: 'chart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Phased plan table', hint: 'Volumes phased by seasonality, with entry lead-time', fn: function () { return window.planPhaseWidgetTable(); } },
        chart: { label: 'Seasonality chart', hint: 'Bar chart of seasonality-weighted wins by period', fn: function () { return window.planPhaseWidgetChart(); } }
      }
    }
  };"""
assert src.count(old_plan_phase_entry) == 1, "WIDGET_LIBRARIES plan_phase entry anchor not found exactly once"
new_plan_phase_entry = """    plan_phase: {
      defaults: { box1: 'table', box2: 'chart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Phased plan table', hint: 'Volumes phased by seasonality, with entry lead-time', fn: function () { return window.planPhaseWidgetTable(); } },
        chart: { label: 'Seasonality chart', hint: 'Bar chart of seasonality-weighted wins by period', fn: function () { return window.planPhaseWidgetChart(); } }
      }
    },
    // Geography & pods: boxes 6-8 (pod breakdown / rate override / stream mix
    // override) only render while a region is selected, and box 9 (rep
    // breakdown) only while that region has a pod -- pageGeo() itself decides
    // which boxes exist each render; this library just lists what CAN appear.
    geo: {
      defaults: { box1: 'kpis', box2: 'gapanalysis', box3: 'streamfunnel', box4: 'winschart', box5: 'acvchart', box6: 'podbreakdown', box7: 'rateoverride', box8: 'streammixoverride', box9: 'repbreakdown' },
      boxSizes: { box1: 12, box2: 12, box3: 12, box4: 6, box5: 6, box6: 12, box7: 12, box8: 12, box9: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'ACV target, projected revenue, variance, AE headcount, wins needed', fn: function () { return window.geoWidgetKpis(); } },
        gapanalysis: { label: 'Gap analysis by region', hint: 'Editable ACV target per region vs demand potential', fn: function () { return window.geoWidgetGapAnalysis(); } },
        streamfunnel: { label: 'Region × stream funnel', hint: 'Demand potential by region and stream, every gate', fn: function () { return window.geoWidgetStreamFunnel(); } },
        winschart: { label: 'Wins needed by region', hint: 'Bar chart of wins needed per region', fn: function () { return window.geoWidgetWinsChart(); } },
        acvchart: { label: 'ACV target vs demand potential', hint: 'Stacked chart of ACV target by region', fn: function () { return window.geoWidgetAcvChart(); } },
        podbreakdown: { label: 'Pod breakdown', hint: 'Editable pod shares for the selected region', fn: function () { return window.geoWidgetPodBreakdown(); } },
        rateoverride: { label: 'Rate override', hint: 'Per-gate rate override for the selected region', fn: function () { return window.geoWidgetRateOverride(); } },
        streammixoverride: { label: 'Stream mix override', hint: 'Per-stream mix override for the selected region', fn: function () { return window.geoWidgetStreamMixOverride(); } },
        repbreakdown: { label: 'Rep breakdown', hint: 'Editable rep shares for the selected pod', fn: function () { return window.geoWidgetRepBreakdown(); } }
      }
    }
  };"""
src = src.replace(old_plan_phase_entry, new_plan_phase_entry, 1)

# --- B. add 'geo' to PAGE_GRID_CONTAINERS ------------------------------------
old_containers = """    plan_phase: 'ordo-grid-plan-phase'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    plan_phase: 'ordo-grid-plan-phase',
    geo: 'ordo-grid-geo'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
