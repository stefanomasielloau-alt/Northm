import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

old_campaign_entry = """        capacity: { label: 'Capacity check', hint: 'Monthly capacity vs plan need by activity, with utilisation and status', fn: function () { return window.campaignWidgetCapacity(); } }
      }
    }
  };"""
assert src.count(old_campaign_entry) == 1, "WIDGET_LIBRARIES campaign entry anchor not found exactly once"
new_campaign_entry = """        capacity: { label: 'Capacity check', hint: 'Monthly capacity vs plan need by activity, with utilisation and status', fn: function () { return window.campaignWidgetCapacity(); } }
      }
    },
    // Dashboard: all 5 boxes always render (no conditional omission, unlike
    // Geography & pods / Campaign & cost) -- the drift card handles its own
    // empty state internally when no snapshot exists yet.
    dashboard: {
      defaults: { box1: 'kpis', box2: 'funnel', box3: 'costbucketchart', box4: 'regions', box5: 'drift' },
      boxSizes: { box1: 12, box2: 6, box3: 6, box4: 12, box5: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Exit gate plan vs actual, budgeted, committed, actual spend, ACV vs demand potential', fn: function () { return window.dashboardWidgetKpis(); } },
        funnel: { label: 'Funnel — plan vs actual', hint: 'Gate-by-gate plan vs actual table with variance and status', fn: function () { return window.dashboardWidgetFunnel(); } },
        costbucketchart: { label: 'Spend by cost bucket', hint: 'Bar chart of spend by cost bucket', fn: function () { return window.dashboardWidgetCostBucketChart(); } },
        regions: { label: 'Regions at a glance', hint: 'Per-region ACV target vs demand potential table', fn: function () { return window.dashboardWidgetRegions(); } },
        drift: { label: 'Plan drift vs baseline snapshot', hint: 'Target and budget drift since a named snapshot', fn: function () { return window.dashboardWidgetDrift(); } }
      }
    }
  };"""
src = src.replace(old_campaign_entry, new_campaign_entry, 1)

old_containers = """    campaign: 'ordo-grid-campaign'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    campaign: 'ordo-grid-campaign',
    dashboard: 'ordo-grid-dashboard'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
