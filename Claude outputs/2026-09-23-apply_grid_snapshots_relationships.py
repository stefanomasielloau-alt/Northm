import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

old_admin_audit_entry = """        log: { label: 'Audit log', hint: 'This session\\'s driver and dimension change log', fn: function () { return window.adminAuditWidgetLog(); } }
      }
    }
  };"""
assert src.count(old_admin_audit_entry) == 1, "WIDGET_LIBRARIES admin_audit entry anchor not found exactly once"
new_admin_audit_entry = """        log: { label: 'Audit log', hint: 'This session\\'s driver and dimension change log', fn: function () { return window.adminAuditWidgetLog(); } }
      }
    },
    snapshots: {
      defaults: { box1: 'save', box2: 'saved', box3: 'compare' },
      boxSizes: { box1: 12, box2: 12, box3: 12 },
      widgets: {
        save: { label: 'Save a snapshot', hint: 'Name and save the current whole plan as a snapshot', fn: function () { return window.snapshotsWidgetSave(); } },
        saved: { label: 'Saved snapshots', hint: 'Saved snapshot list -- revert, overlay, or remove', fn: function () { return window.snapshotsWidgetSaved(); } },
        compare: { label: 'Compare vs snapshots & actual', hint: 'Gate-by-gate current plan vs up to 3 recent snapshots vs actual', fn: function () { return window.snapshotsWidgetCompare(); } }
      }
    },
    // Relationships: a single interactive pan/zoom/drag canvas, not a set of
    // independent lenses -- one box, no real widget picker, wrapped purely
    // for structural consistency with the rest of the app.
    relationships: {
      defaults: { box1: 'graph' },
      boxSizes: { box1: 12 },
      widgets: {
        graph: { label: 'Relationship graph', hint: 'Campaign -> owner / business-unit node graph, drag to pin, click to focus', fn: function () { return window.relationshipsWidgetGraph(); } }
      }
    }
  };"""
src = src.replace(old_admin_audit_entry, new_admin_audit_entry, 1)

old_containers = """    admin_audit: 'ordo-grid-admin-audit'
  };"""
assert src.count(old_containers) == 1, "PAGE_GRID_CONTAINERS anchor not found exactly once"
new_containers = """    admin_audit: 'ordo-grid-admin-audit',
    snapshots: 'ordo-grid-snapshots',
    relationships: 'ordo-grid-relationships'
  };"""
src = src.replace(old_containers, new_containers, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
