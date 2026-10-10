/* shared/lineItemRollup.js  (2026-10-09)
   ONE place that turns budget line items into the three campaign figures Strategy uses.

   Rule (Stef's 7 Oct answer #5, mapping confirmed 9 Oct):
     Budget    = per line: Approved amount, else Planned amount   (summed)
     Committed = Committed amount                                  (summed)
     Actual    = Actual amount                                     (summed)
   A campaign's lines = lines attached to the campaign itself + lines attached to its tasks.
   Each figure is used ONLY when at least one line has a value for it ("has" flag); otherwise Strategy keeps
   using today's plain fields, so a campaign with no line items (or none with that stage filled in) is unchanged.

   NorthLineItemRollup.build(lines, tasks) -> { [campaignId]: { n, budget, hasBudget, committed, hasCommitted, actual, hasActual } }
     lines: rows of budget_line_items  { parent_type, parent_id, planned_amount, approved_amount, committed_amount, actual_amount }
     tasks: rows of tasks              { id, campaign_id }
   NorthLineItemRollup.figure(camp, 'budget'|'committed'|'actual') -> number, or null when this figure should not come from lines.
   ROLLBACK: remove the <script> tag and the three helper lines in Strategy; everything else is additive. */
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  function isNum(v){ return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }

  function build(lines, tasks){
    var taskCamp = {};
    (tasks || []).forEach(function(t){ if(t && t.id && t.campaign_id) taskCamp[t.id] = t.campaign_id; });
    var out = {};
    (lines || []).forEach(function(li){
      if(!li) return;
      var cid = li.parent_type === 'campaign' ? li.parent_id : (li.parent_type === 'task' ? taskCamp[li.parent_id] : null);
      if(!cid) return;
      var r = out[cid] || (out[cid] = { n:0, budget:0, hasBudget:false, committed:0, hasCommitted:false, actual:0, hasActual:false });
      r.n++;
      var b = isNum(li.approved_amount) ? Number(li.approved_amount) : (isNum(li.planned_amount) ? Number(li.planned_amount) : null);
      if(b !== null){ r.budget += b; r.hasBudget = true; }
      if(isNum(li.committed_amount)){ r.committed += Number(li.committed_amount); r.hasCommitted = true; }
      if(isNum(li.actual_amount)){ r.actual += Number(li.actual_amount); r.hasActual = true; }
    });
    return out;
  }

  function figure(camp, which){
    var li = camp && camp.li;
    if(!li) return null;
    if(which === 'budget')    return li.hasBudget    ? li.budget    : null;
    if(which === 'committed') return li.hasCommitted ? li.committed : null;
    if(which === 'actual')    return li.hasActual    ? li.actual    : null;
    return null;
  }

  G.NorthLineItemRollup = { build: build, figure: figure };
})();
