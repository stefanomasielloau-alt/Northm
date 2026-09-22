import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

old_insight_ready_entry = """        dimensionality: { label: 'Dimensionality table', hint: 'Member counts and cumulative addressable cells by dimension', fn: function () { return window.insightReadyWidgetDimensionality(); } }
      }
    }
  };"""
assert src.count(old_insight_ready_entry) == 1, "WIDGET_LIBRARIES insight_ready entry anchor not found exactly once"
new_insight_ready_entry = """        dimensionality: { label: 'Dimensionality table', hint: 'Member counts and cumulative addressable cells by dimension', fn: function () { return window.insightReadyWidgetDimensionality(); } }
      }
    },
    // Campaign, cost & capacity: boxes 5-7 (business case / pre-entry chain /
    // pod allocation) only render while a campaign is selected, and box 6
    // additionally only while that campaign's activity has a pre-entry chain
    // -- pageCampaign() builds the box list dynamically each render, same
    // approach as Geography & pods.
    campaign: {
      defaults: { box1: 'kpis', box2: 'calendar', box3: 'table', box4: 'costbucketchart', box5: 'businesscase', box6: 'prechain', box7: 'podallocation', box8: 'portfolio', box9: 'capacity' },
      boxSizes: { box1: 12, box2: 12, box3: 12, box4: 12, box5: 12, box6: 12, box7: 12, box8: 12, box9: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Budgeted, committed, actual spend, peak concurrency, cost per win', fn: function () { return window.campaignWidgetKpis(); } },
        calendar: { label: 'Campaign calendar', hint: 'Concurrency and straight-lined spend over the next 12 months', fn: function () { return window.campaignWidgetCalendar(); } },
        table: { label: 'Campaigns in scope', hint: 'Full campaign table with budget, spend, conversion and cost/win', fn: function () { return window.campaignWidgetTable(); } },
        costbucketchart: { label: 'Spend by cost bucket', hint: 'Bar chart of spend by cost bucket', fn: function () { return window.campaignWidgetCostBucketChart(); } },
        businesscase: { label: 'Business case', hint: 'Budget to projected wins for a selected campaign', fn: function () { return window.campaignWidgetBusinessCase(); } },
        prechain: { label: 'Pre-entry chain', hint: 'Channel-specific stages feeding into the entry gate for the selected campaign', fn: function () { return window.campaignWidgetPreChain(); } },
        podallocation: { label: 'Pod allocation', hint: 'Optional split of a campaign across pods by percentage', fn: function () { return window.campaignWidgetPodAllocation(); } },
        portfolio: { label: 'Portfolio business case', hint: 'Roll-up of every campaign business case in scope', fn: function () { return window.campaignWidgetPortfolio(); } },
        capacity: { label: 'Capacity check', hint: 'Monthly capacity vs plan need by activity, with utilisation and status', fn: function () { return window.campaignWidgetCapacity(); } }
      }
    }
  };"""
src = src.replace(old_insight_ready_entry, new_insight_ready_entry, 1)

old_containers = """    insight_ready: 'ordo-grid-insight-ready'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    insight_ready: 'ordo-grid-insight-ready',
    campaign: 'ordo-grid-campaign'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
