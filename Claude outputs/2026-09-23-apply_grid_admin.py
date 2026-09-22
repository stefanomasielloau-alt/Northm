import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

old_calculator_entry = """        reference: { label: 'Reference — real gate chain', hint: 'Blended assumption vs the detailed engine\\'s actual per-gate rates', fn: function () { return window.calcWidgetReference(); } }
      }
    }
  };"""
assert src.count(old_calculator_entry) == 1, "WIDGET_LIBRARIES calculator entry anchor not found exactly once"
new_calculator_entry = """        reference: { label: 'Reference — real gate chain', hint: 'Blended assumption vs the detailed engine\\'s actual per-gate rates', fn: function () { return window.calcWidgetReference(); } }
      }
    },
    // Admin & config: a settings/CRUD page, not an analysis page, so this is
    // the "awkward fit" treatment -- one grid per TAB (admin_<tab>, same
    // __northGridSubId mechanism as Planning engine/Insight), boxes are each
    // tab's existing card groupings. No conditional box omission (unlike
    // Geography & pods / Campaign & cost) -- every admin tab's cards always
    // render, since this is configuration state, not a drill-down view.
    admin_gates: {
      defaults: { box1: 'set', box2: 'preview', box3: 'presets' },
      boxSizes: { box1: 12, box2: 6, box3: 6 },
      widgets: {
        set: { label: 'Gate set', hint: 'Editable funnel gate chain: name, code, rate, order', fn: function () { return window.adminGatesWidgetSet(); } },
        preview: { label: 'Chain preview', hint: 'Funnel visualisation of the current gate chain', fn: function () { return window.adminGatesWidgetPreview(); } },
        presets: { label: 'Gate naming presets', hint: 'Starter gate-chain presets and where gates are used', fn: function () { return window.adminGatesWidgetPresets(); } }
      }
    },
    admin_geo: {
      defaults: { box1: 'regions', box2: 'pods', box3: 'reps' },
      boxSizes: { box1: 12, box2: 12, box3: 12 },
      widgets: {
        regions: { label: 'Regions', hint: 'Editable regions table with AE heads, ACV target, pod allocation', fn: function () { return window.adminGeoWidgetRegions(); } },
        pods: { label: 'Pods', hint: 'Editable pods table grouped by region', fn: function () { return window.adminGeoWidgetPods(); } },
        reps: { label: 'Reps', hint: 'Editable reps table grouped by pod', fn: function () { return window.adminGeoWidgetReps(); } }
      }
    },
    admin_streams: {
      defaults: { box1: 'table' },
      boxSizes: { box1: 12 },
      widgets: {
        table: { label: 'Streams', hint: 'Editable stream mix, marketing contribution and derived wins', fn: function () { return window.adminStreamsWidgetTable(); } }
      }
    },
    admin_acts: {
      defaults: { box1: 'table', box2: 'prechains' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Activities', hint: 'Editable activities table: route, cost/lead, capacity, active state', fn: function () { return window.adminActsWidgetTable(); } },
        prechains: { label: 'Pre-Lead chains', hint: 'Optional per-activity channel-specific stages before the Lead gate', fn: function () { return window.adminActsWidgetPreChains(); } }
      }
    },
    admin_segs: {
      defaults: { box1: 'table' },
      boxSizes: { box1: 12 },
      widgets: {
        table: { label: 'Segments', hint: 'Editable segments table: mix, rate/deal multipliers, addressable/engaged', fn: function () { return window.adminSegsWidgetTable(); } }
      }
    },
    admin_camps: {
      defaults: { box1: 'cursuslink', box2: 'programmes', box3: 'table' },
      boxSizes: { box1: 12, box2: 12, box3: 12 },
      widgets: {
        cursuslink: { label: 'Campaign Planning link', hint: 'Export/import bridge to the separate Campaign Planning tool', fn: function () { return window.adminCampsWidgetCursusLink(); } },
        programmes: { label: 'Programme roll-up', hint: 'Programmes with campaign count, budget, committed, actual', fn: function () { return window.adminCampsWidgetProgrammes(); } },
        table: { label: 'Campaigns', hint: 'Full editable campaigns table', fn: function () { return window.adminCampsWidgetTable(); } }
      }
    },
    admin_buckets: {
      defaults: { box1: 'sharedconfig', box2: 'localautosave', box3: 'costbuckets' },
      boxSizes: { box1: 6, box2: 6, box3: 12 },
      widgets: {
        sharedconfig: { label: 'Shared configuration', hint: 'Link and import from the cross-tool Configuration app', fn: function () { return window.adminBucketsWidgetSharedConfig(); } },
        localautosave: { label: 'Local autosave', hint: 'Clear this browser\\'s local autosave', fn: function () { return window.adminBucketsWidgetLocalAutosave(); } },
        costbuckets: { label: 'Cost buckets', hint: 'Editable cost bucket list with campaign usage count', fn: function () { return window.adminBucketsWidgetCostBuckets(); } }
      }
    },
    admin_time: {
      defaults: { box1: 'fiscalcalendar', box2: 'periodmap' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        fiscalcalendar: { label: 'Fiscal calendar', hint: 'FY start month, reporting grain, current FY', fn: function () { return window.adminTimeWidgetFiscalCalendar(); } },
        periodmap: { label: 'Period map', hint: 'How loaded months resolve to FY/quarter/half/seasonality', fn: function () { return window.adminTimeWidgetPeriodMap(); } }
      }
    },
    admin_ver: {
      defaults: { box1: 'table' },
      boxSizes: { box1: 12 },
      widgets: {
        table: { label: 'Versions & scenarios', hint: 'Version/scenario list with lock state and rate multiplier', fn: function () { return window.adminVerWidgetTable(); } }
      }
    },
    admin_users: {
      defaults: { box1: 'moved', box2: 'requirecommit' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        moved: { label: 'Roles & users (moved)', hint: 'Pointer to Configuration, where roles & users now live', fn: function () { return window.adminUsersWidgetMoved(); } },
        requirecommit: { label: 'Requires commit on plan edits', hint: 'Per-role toggle, Strategy/Campaign Planning only', fn: function () { return window.adminUsersWidgetRequireCommit(); } }
      }
    },
    admin_feeds: {
      defaults: { box1: 'connections', box2: 'loadrules', box3: 'adjacencies' },
      boxSizes: { box1: 12, box2: 6, box3: 6 },
      widgets: {
        connections: { label: 'Connections', hint: 'Feed connections table with rows, rejects, unassigned, state', fn: function () { return window.adminFeedsWidgetConnections(); } },
        loadrules: { label: 'Load rules', hint: 'The feed loading invariants (staging, idempotent keys, etc.)', fn: function () { return window.adminFeedsWidgetLoadRules(); } },
        adjacencies: { label: 'Future adjacencies', hint: 'Reserved join keys for not-yet-integrated tools', fn: function () { return window.adminFeedsWidgetAdjacencies(); } }
      }
    },
    admin_audit: {
      defaults: { box1: 'log' },
      boxSizes: { box1: 12 },
      widgets: {
        log: { label: 'Audit log', hint: 'This session\\'s driver and dimension change log', fn: function () { return window.adminAuditWidgetLog(); } }
      }
    }
  };"""
src = src.replace(old_calculator_entry, new_calculator_entry, 1)

old_containers = """    calculator: 'ordo-grid-calculator'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    calculator: 'ordo-grid-calculator',
    admin_gates: 'ordo-grid-admin-gates',
    admin_geo: 'ordo-grid-admin-geo',
    admin_streams: 'ordo-grid-admin-streams',
    admin_acts: 'ordo-grid-admin-acts',
    admin_segs: 'ordo-grid-admin-segs',
    admin_camps: 'ordo-grid-admin-camps',
    admin_buckets: 'ordo-grid-admin-buckets',
    admin_time: 'ordo-grid-admin-time',
    admin_ver: 'ordo-grid-admin-ver',
    admin_users: 'ordo-grid-admin-users',
    admin_feeds: 'ordo-grid-admin-feeds',
    admin_audit: 'ordo-grid-admin-audit'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
