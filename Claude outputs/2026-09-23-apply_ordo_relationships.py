import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

start_marker = "\nfunction pageRelationships(){\n"
end_marker = "\nwindow.pageRelationships=pageRelationships;"

start_idx = src.find(start_marker)
assert start_idx != -1, "start marker not found"
assert src.count(start_marker) == 1, "start marker not unique"
end_idx = src.find(end_marker, start_idx)
assert end_idx != -1, "end marker not found after start"

old_block = src[start_idx + 1:end_idx]
assert old_block.startswith("function pageRelationships(){"), "unexpected block start:\n" + old_block[:80]
assert old_block.rstrip().endswith("}"), "unexpected block end:\n" + old_block[-80:]
assert "computeRelGraph()" in old_block, "computeRelGraph call missing"
assert "relSvgHtml(g.nodes,g.edges)" in old_block, "relSvgHtml call missing"
assert "No campaigns in scope yet" in old_block, "empty-state missing"

new_block = '''function relationshipsWidgetGraph(){
  const g=computeRelGraph();
  relLayoutSeed(g.nodes);
  relRunForces(g.nodes,g.edges);
  return `<div class="card"><div class="bd" style="padding:12px 14px">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <select class="in" style="width:auto" onchange="UI.relFilterOwner=this.value;render()">
        <option value="">All owners</option>
        ${g.ownerOptions.map(o=>`<option value="${esc(o)}" ${UI.relFilterOwner===o?'selected':''}>${esc(o)}</option>`).join('')}
      </select>
      <select class="in" style="width:auto" onchange="UI.relFilterBiz=this.value;render()">
        <option value="">All business units</option>
        ${g.bizOptions.map(b=>`<option value="${esc(b.id)}" ${UI.relFilterBiz===b.id?'selected':''}>${esc(b.label)}</option>`).join('')}
      </select>
      ${(UI.relFilterOwner||UI.relFilterBiz)?'<button class="btn sm" onclick="UI.relFilterOwner=\\'\\';UI.relFilterBiz=\\'\\';render()">Clear filters</button>':''}
      <div class="sp"></div>
      <button class="btn sm" onclick="relZoomBtn('out')">−</button>
      <button class="btn sm" onclick="relZoomBtn('in')">+</button>
      <button class="btn sm" onclick="relResetView()">Reset view</button>
    </div>
    ${relSvgHtml(g.nodes,g.edges)}
    <div class="lgd" style="margin-top:10px">
      <span><i class="sw" style="background:#3A5A8C"></i>Business unit</span>
      <span><i class="sw" style="background:#5A3E9C"></i>Owner</span>
      <span><i class="sw" style="background:#1F3AC7"></i>Campaign</span>
      <span><i class="sw" style="background:#9C2B3C"></i>Campaign missing owner or business unit</span>
    </div>
    <div class="mini" style="margin-top:6px">Drag a node to pin it in place; click a node to highlight its connections, click again to clear. Layout resets on reload -- nothing here is saved to the plan.</div>
  </div></div>`;
}
window.relationshipsWidgetGraph=relationshipsWidgetGraph;
function pageRelationships(){
  const gCheck=computeRelGraph();

  let h=`<div class="phead"><div><h1>Relationships</h1>
    <p>How campaigns connect to their owner (Campaign Planning's Programme owner field) and business unit (via Region → Org unit). ${gCheck.broken?'<b>'+gCheck.broken+'</b> campaign'+(gCheck.broken===1?'':'s')+' missing an owner or business unit':'Every visible campaign has both.'}</p></div>
    <div class="sp"></div>
    <button class="btn sm" onclick="relResetLayout()">Reset layout</button></div>`;

  if(!gCheck.total){
    h+=`<div class="card"><div class="empty">No campaigns in scope yet, so there's nothing to graph.</div></div>`;
    return h;
  }

  /* Only one meaningful box on this page -- the graph is a single interactive
     pan/zoom/drag canvas, not a set of independent lenses on the same data
     (unlike every analysis page done so far), so there's nothing coherent to
     offer a widget picker for. Wrapped in the grid-stack purely for structural
     consistency with the rest of the app; see the "awkward fits" note in the
     rollout log for the reasoning. */
  const assigned=(window.northGetWidgetAssignments?window.northGetWidgetAssignments('relationships'):{box1:'graph'});
  const relationshipsWidgetFns={graph:relationshipsWidgetGraph};
  h+=`<div class="grid-stack" id="ordo-grid-relationships">`;
  {
    const widgetId=assigned.box1||'graph';
    const fn=relationshipsWidgetFns[widgetId]||relationshipsWidgetFns.graph;
    h+=`<div class="grid-stack-item" gs-w="12" gs-id="box1">
      <div class="grid-stack-item-content">${fn()}</div>
    </div>`;
  }
  h+=`</div>`;
  return h;
}
'''

new_src = src[:start_idx + 1] + new_block + src[end_idx + 1:]

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(new_src)

print("OK, chars before:", orig_len, "after:", len(new_src), "delta:", len(new_src) - orig_len)
