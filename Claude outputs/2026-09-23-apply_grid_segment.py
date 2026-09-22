import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

old_activity_entry = """        costchart: { label: 'Cost per win by activity', hint: 'Bar chart of cost per win, activities with tracked cost only', fn: function () { return window.activityWidgetCostChart(); } }
      }
    }
  };"""
assert src.count(old_activity_entry) == 1, "WIDGET_LIBRARIES activity entry anchor not found exactly once"
new_activity_entry = """        costchart: { label: 'Cost per win by activity', hint: 'Bar chart of cost per win, activities with tracked cost only', fn: function () { return window.activityWidgetCostChart(); } }
      }
    },
    segment: {
      defaults: { box1: 'kpis', box2: 'derivedplan', box3: 'entrychart', box4: 'acvchart', box5: 'observedrate' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6, box5: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Blended rate multiplier, deal size, addressable/engaged accounts, mix total', fn: function () { return window.segmentWidgetKpis(); } },
        derivedplan: { label: 'Derived plan by segment', hint: 'Wins, gate volumes, deal size and ACV per segment', fn: function () { return window.segmentWidgetDerivedPlan(); } },
        entrychart: { label: 'Entry volume required by segment', hint: 'Bar chart of entry-gate volume per segment', fn: function () { return window.segmentWidgetEntryChart(); } },
        acvchart: { label: 'ACV contribution by segment', hint: 'Waterfall of ACV contribution per segment', fn: function () { return window.segmentWidgetAcvChart(); } },
        observedrate: { label: 'Observed rate by segment', hint: 'Historical observed rate per gate, by segment, with evidence', fn: function () { return window.segmentWidgetObservedRate(); } }
      }
    }
  };"""
src = src.replace(old_activity_entry, new_activity_entry, 1)

old_containers = """    activity: 'ordo-grid-activity'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    activity: 'ordo-grid-activity',
    segment: 'ordo-grid-segment'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
