/* shared/budgetLines.js  (2026-10-09)
   Budget line items -- the entry panel for Reference Environment subsystem 1, step 2b.
   Self-contained: it talks to the budget_line_categories / budget_line_items tables (migration 2026-10-07-migration-budget-line-items.sql)
   and the campaign_budget_rollup view through the Supabase client you hand it. It does not touch any page's own state, so a page
   adds line items by mounting it into any element:

     NorthBudgetLines.mount(document.getElementById('x'), {
       sb,                         // the page's Supabase client
       orgId,                      // org that owns the rows (use the page's _clickOrgId())
       parentType: 'campaign',     // 'campaign' | 'task'
       parentId,                   // uuid of the campaign / task
       canEdit: true,              // false = read-only table
       title: 'Budget line items', // optional
       currency: '$',              // optional symbol
       showRollup: true,           // campaign only: also show the total INCLUDING its tasks (campaign_budget_rollup view)
       onChange(totals){},         // optional: called after every load/save with {planned,quoted,approved,committed,actual,variance,count}
       onAudit(what, detail){}     // optional: e.g. page's logAudit
     }) -> { reload(), destroy(), totals() }

   Rules (Stef, 2026-10-07): five stages planned -> quoted -> approved -> committed -> actual, plus variance amount + reason; categories
   (2026-10-10: Variance is auto-calculated and read-only; saving a box no longer redraws the table so Tab keeps working.) are admin-editable (Configuration > Budget categories); zero line items is a valid state (totals simply read 0); edit permission is the
   caller's canEdit (same gating as campaign budgets today). Amounts are saved when a box is left, one row at a time. */
(function(){
  'use strict';
  const STAGES=[['planned_amount','Planned'],['quoted_amount','Quoted'],['approved_amount','Approved'],['committed_amount','Committed'],['actual_amount','Actual']];
  const AMOUNT_FIELDS=STAGES.map(s=>s[0]); /* 2026-10-10: variance_amount is auto-calculated, never typed */
  const MISSING='Budget line items are not installed yet. The platform owner needs to run 2026-10-07-migration-budget-line-items.sql once.';
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cssDone=false;
  function css(){
    if(cssDone||typeof document==='undefined') return; cssDone=true;
    const st=document.createElement('style'); st.id='nbl-css';
    st.textContent=
      '.nbl{border:1px solid var(--line,#d9dee8);border-radius:8px;background:var(--surface,#fff);margin:10px 0}'+
      '.nbl-h{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line-2,#e8ecf3);font-weight:700;font-size:13px}'+
      '.nbl-h .nbl-sp{flex:1}.nbl-n{font-weight:400;font-size:11.5px;color:var(--ink-3,#6b7894)}'+
      '.nbl-b{padding:8px 12px;overflow-x:auto}'+
      '.nbl table{width:100%;border-collapse:collapse;font-size:12px}'+
      '.nbl th{text-align:right;font-weight:600;color:var(--ink-3,#6b7894);padding:3px 4px;white-space:nowrap}'+
      '.nbl th:first-child,.nbl th.nbl-l{text-align:left}'+
      '.nbl td{padding:2px 3px;vertical-align:top}'+
      '.nbl input,.nbl select{font:inherit;font-size:12px;padding:4px 6px;border:1px solid var(--line,#d9dee8);border-radius:5px;background:var(--input-bg,#fff);color:inherit;box-sizing:border-box;width:100%}'+
      '.nbl input.nbl-amt{text-align:right;min-width:78px}.nbl input.nbl-bad{border-color:var(--bad,#b3261e);background:#fdf1f0}'+
      '.nbl td.nbl-var{text-align:right;white-space:nowrap;padding:4px 8px;background:var(--surface-2,#f4f6fa);border-radius:5px;font-size:12px;min-width:78px}.nbl td.nbl-var.over{color:var(--bad,#b3261e);font-weight:600}.nbl td.nbl-var.under{color:#1a7f37;font-weight:600}'+
      '.nbl td.nbl-st{font-size:11px;color:var(--ink-3,#6b7894);white-space:nowrap;padding-left:6px}.nbl td.nbl-st.err{color:var(--bad,#b3261e)}'+
      '.nbl tfoot td{font-weight:700;text-align:right;border-top:1px solid var(--line,#d9dee8);padding:5px 6px}'+
      '.nbl tfoot td:first-child{text-align:left}.nbl tr.nbl-roll td{font-weight:400;color:var(--ink-3,#6b7894);border-top:0}'+
      '.nbl button{font:inherit;font-size:11.5px;padding:3px 9px;border:1px solid var(--line,#d9dee8);border-radius:5px;background:var(--surface,#fff);cursor:pointer}'+
      '.nbl button:disabled{opacity:.5;cursor:default}.nbl button.nbl-x{color:var(--bad,#b3261e);border-color:#f3c9c6}'+
      '.nbl .nbl-note{padding:8px 12px;font-size:12px;color:var(--ink-2,#46536e)}.nbl .nbl-err{color:var(--bad,#b3261e)}';
    document.head.appendChild(st);
  }
  function parseAmount(v){
    const s=String(v==null?'':v).trim(); if(s==='') return {ok:true,val:null};
    const neg=/^\(.*\)$/.test(s)||/^-/.test(s);
    const n=Number(s.replace(/[\s,$()\-]/g,'')); if(!isFinite(n)||/[^0-9.,$()\s\-]/.test(s)) return {ok:false};
    return {ok:true,val:neg?-n:n};
  }
  const num=v=>(v==null||v===''||!isFinite(Number(v)))?0:Number(v);
  const has=v=>v!=null&&v!==''&&isFinite(Number(v));
  /* 2026-10-10 (Stef: "Variance should be an auto calc field that can't be edited"):
     Variance = outcome - budget, where budget = Approved, else Planned (same rule as the Strategy roll-up) and
     outcome = Actual if entered, else Committed if entered. Positive = over budget. Blank until both exist.
     The result is also saved into variance_amount so the roll-up view keeps working. ONE place to change the rule. */
  function calcVariance(i){
    const b=has(i.approved_amount)?Number(i.approved_amount):(has(i.planned_amount)?Number(i.planned_amount):null);
    const o=has(i.actual_amount)?Number(i.actual_amount):(has(i.committed_amount)?Number(i.committed_amount):null);
    if(b===null||o===null) return null;
    return Math.round((o-b)*100)/100;
  }
  function mount(el,opts){
    css();
    opts=opts||{};
    const sb=opts.sb, cur=opts.currency||'$';
    const S={cats:[],items:[],loading:true,error:'',rowMsg:{},busy:{},roll:null,dead:false,seq:0};
    const fmt=n=>cur+Number(n||0).toLocaleString('en-AU',{minimumFractionDigits:0,maximumFractionDigits:2});
    const can=()=>!!opts.canEdit;
    function totals(){
      const t={planned:0,quoted:0,approved:0,committed:0,actual:0,variance:0,count:S.items.length};
      S.items.forEach(i=>{ t.planned+=num(i.planned_amount); t.quoted+=num(i.quoted_amount); t.approved+=num(i.approved_amount); t.committed+=num(i.committed_amount); t.actual+=num(i.actual_amount); t.variance+=num(calcVariance(i)); });
      return t;
    }
    function notify(){ try{ opts.onChange&&opts.onChange(totals()); }catch(e){} }
    function friendly(err){
      const m=String(err&&err.message||err||''), code=err&&err.code;
      if(code==='42P01'||code==='PGRST205'||/does not exist|schema cache/i.test(m)) return MISSING;
      if(code==='42501'||/permission denied|row-level security/i.test(m)) return 'You do not have permission to change budget line items here.';
      if(code==='22P02'||/invalid input syntax for type uuid/i.test(m)) return 'This record has not been saved yet — save it first, then add budget lines.';
      return m||'Something went wrong.';
    }
    async function load(){
      const my=++S.seq; S.loading=true; S.error=''; draw();
      try{
        const q=[
          sb.from('budget_line_categories').select('id,name,sort_order').eq('org_id',opts.orgId).order('sort_order'),
          sb.from('budget_line_items').select('*').eq('parent_type',opts.parentType).eq('parent_id',opts.parentId).order('sort_order').order('created_at')
        ];
        if(opts.showRollup&&opts.parentType==='campaign') q.push(sb.from('campaign_budget_rollup').select('*').eq('campaign_id',opts.parentId).maybeSingle());
        const r=await Promise.all(q);
        if(my!==S.seq||S.dead) return;
        const bad=r.find(x=>x&&x.error);
        if(bad){ S.error=friendly(bad.error); }
        else { S.cats=r[0].data||[]; S.items=r[1].data||[]; S.roll=r[2]?(r[2].data||null):null; }
      }catch(e){ if(my!==S.seq||S.dead) return; S.error=friendly(e); }
      S.loading=false; draw(); notify();
    }
    const fmtVar=v=>v==null?'—':((Number(v)>0?'+':Number(v)<0?'-':'')+fmt(Math.abs(Number(v))));
    function varCls(v){ return 'nbl-var'+(v==null?'':(v>0?' over':(v<0?' under':''))); }
    function varCell(i){ const v=calcVariance(i); return '<td class="'+varCls(v)+'" data-var aria-label="Variance (auto-calculated)" title="Auto-calculated: Actual (else Committed) minus Budget (Approved, else Planned). Positive = over budget.">'+fmtVar(v)+'</td>'; }
    function rollNeeded(){ return !!(S.roll&&Number(S.roll.line_item_count)>S.items.length); }
    /* 2026-10-10: partial paints (Stef: "can't Tab between fields"). Saving a box used to redraw the whole table, which
       dropped keyboard focus; now only the status, variance and total cells change, so Tab keeps moving. */
    function paintRow(id){
      if(S.dead||!el) return; const tr=el.querySelector('tr[data-id="'+id+'"]'); if(!tr) return;
      const it=S.items.find(x=>x.id===id), m=S.rowMsg[id], busy=!!S.busy[id];
      const st=tr.querySelector('.nbl-st'); if(st){ st.textContent=busy?'saving…':(m?m.text:''); st.classList.toggle('err',!!(m&&m.bad)); }
      const vc=tr.querySelector('td[data-var]'); if(vc&&it){ const v=calcVariance(it); vc.className=varCls(v); vc.textContent=fmtVar(v); }
      const dx=tr.querySelector('[data-a="del"]'); if(dx) dx.disabled=busy;
    }
    function paintTotals(){
      if(S.dead||!el) return; const t=totals();
      ['planned','quoted','approved','committed','actual','variance'].forEach(k=>{ const c=el.querySelector('tfoot td[data-t="'+k+'"]'); if(c) c.textContent=(k==='variance'?fmtVar(t[k]):fmt(t[k])); });
      const n=el.querySelector('.nbl-n'); if(n&&!S.loading) n.textContent=t.count+' line'+(t.count===1?'':'s');
    }
    function paintRoll(){
      if(S.dead||!el) return; const tr=el.querySelector('tr.nbl-roll'), need=rollNeeded();
      if(tr&&need){ ['planned_total','quoted_total','approved_total','committed_total','actual_total','variance_total'].forEach(k=>{ const c=tr.querySelector('td[data-r="'+k+'"]'); if(c) c.textContent=(k==='variance_total'?fmtVar(S.roll[k]):fmt(S.roll[k])); }); return; }
      if(!!tr===need) return;
      const a=document.activeElement; if(a&&el.contains(a)&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return; /* never yank focus out of a box */
      draw();
    }
    function catName(id){ const c=S.cats.find(x=>x.id===id); return c?c.name:''; }
    function draw(){
      if(S.dead||!el) return;
      const dis=can()?'':' disabled', t=totals();
      let h='<div class="nbl"><div class="nbl-h"><span>'+esc(opts.title||'Budget line items')+'</span><span class="nbl-n">'+(S.loading?'loading…':t.count+' line'+(t.count===1?'':'s'))+'</span><span class="nbl-sp"></span>'+
        (can()&&!S.error?'<button type="button" data-a="add"'+(S.loading||S.busy._add?' disabled':'')+'>+ Add line</button>':'')+'</div>';
      if(S.error){ h+='<div class="nbl-note nbl-err" role="alert">'+esc(S.error)+'</div></div>'; el.innerHTML=h; wire(); return; }
      h+='<div class="nbl-b">';
      if(!S.loading&&!S.items.length) h+='<div class="nbl-note" style="padding:2px 0 6px">'+(rollNeeded()?'No line items on this record itself — the lines below belong to its activities.':'No line items yet — totals read 0 until you add some.')+(can()?'':' You have view-only access.')+'</div>';
      if(S.items.length||S.loading||rollNeeded()){
        h+='<table><thead><tr><th class="nbl-l">Category</th><th class="nbl-l">Description</th>'+STAGES.map(s=>'<th>'+s[1]+'</th>').join('')+'<th title="Auto-calculated: Actual (else Committed) minus Budget (Approved, else Planned). Positive = over budget.">Variance</th><th class="nbl-l">Variance reason</th><th></th><th></th></tr></thead><tbody>';
        S.items.forEach(i=>{
          const m=S.rowMsg[i.id], busy=!!S.busy[i.id];
          h+='<tr data-id="'+esc(i.id)+'"><td style="min-width:110px"><select data-f="category_id" aria-label="Category"'+dis+'><option value="">—</option>'+
            S.cats.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===i.category_id?' selected':'')+'>'+esc(c.name)+'</option>').join('')+
            (i.category_id&&!catName(i.category_id)?'<option value="'+esc(i.category_id)+'" selected>(removed category)</option>':'')+'</select></td>'+
            '<td style="min-width:150px"><input data-f="description" aria-label="Description" value="'+esc(i.description||'')+'"'+dis+'></td>'+
            STAGES.map(s=>'<td><input class="nbl-amt" inputmode="decimal" data-f="'+s[0]+'" aria-label="'+s[1]+' amount" value="'+esc(i[s[0]]==null?'':i[s[0]])+'"'+dis+'></td>').join('')+
            varCell(i)+
            '<td style="min-width:130px"><input data-f="variance_reason" aria-label="Variance reason" value="'+esc(i.variance_reason||'')+'"'+dis+'></td>'+
            '<td class="nbl-st'+(m&&m.bad?' err':'')+'" role="status">'+esc(busy?'saving…':(m?m.text:''))+'</td>'+
            '<td>'+(can()?'<button type="button" class="nbl-x" data-a="del" aria-label="Delete line"'+(busy?' disabled':'')+'>Delete</button>':'')+'</td></tr>';
        });
        h+='</tbody><tfoot><tr><td>Total</td><td></td>'+['planned','quoted','approved','committed','actual','variance'].map(k=>'<td data-t="'+k+'">'+(k==='variance'?fmtVar(t[k]):fmt(t[k]))+'</td>').join('')+'<td></td><td></td><td></td></tr>';
        if(rollNeeded()){
          const rr=S.roll; h+='<tr class="nbl-roll"><td>Including tasks</td><td></td>'+['planned_total','quoted_total','approved_total','committed_total','actual_total','variance_total'].map(k=>'<td data-r="'+k+'">'+(k==='variance_total'?fmtVar(rr[k]):fmt(rr[k]))+'</td>').join('')+'<td></td><td></td><td></td></tr>';
        }
        h+='</tfoot></table>';
      }
      h+='</div></div>'; el.innerHTML=h; wire();
    }
    function wire(){
      el.querySelectorAll('[data-a]').forEach(b=>{ b.onclick=()=>{ const a=b.getAttribute('data-a'), tr=b.closest('tr'); if(a==='add') add(); else if(a==='del'&&tr) del(tr.getAttribute('data-id')); }; });
      el.querySelectorAll('tr[data-id] [data-f]').forEach(inp=>{
        inp.onchange=()=>{ const tr=inp.closest('tr'); save(tr.getAttribute('data-id'),inp.getAttribute('data-f'),inp); };
      });
    }
    async function add(){
      if(!can()||S.busy._add) return; S.busy._add=true; draw();
      try{
        const order=S.items.reduce((m,i)=>Math.max(m,Number(i.sort_order)||0),0)+1;
        const { data, error } = await sb.from('budget_line_items').insert({org_id:opts.orgId,parent_type:opts.parentType,parent_id:opts.parentId,sort_order:order}).select().single();
        if(error) throw error;
        S.items.push(data); try{ opts.onAudit&&opts.onAudit('budget line added',opts.parentType+' '+opts.parentId); }catch(e){}
      }catch(e){ S.error=friendly(e); }
      S.busy._add=false; draw(); notify(); if(!S.error){ try{ const nb=el&&S.items.length&&el.querySelector('tr[data-id="'+S.items[S.items.length-1].id+'"] [data-f="description"]'); if(nb) nb.focus(); }catch(e){} reloadRollup(); }
    }
    async function del(id){
      if(!can()||!id) return;
      if(typeof confirm==='function'&&!confirm('Delete this budget line?')) return;
      S.busy[id]=true; draw();
      try{
        const { error } = await sb.from('budget_line_items').delete().eq('id',id);
        if(error) throw error;
        S.items=S.items.filter(i=>i.id!==id); delete S.rowMsg[id]; try{ opts.onAudit&&opts.onAudit('budget line deleted',opts.parentType+' '+opts.parentId); }catch(e){}
      }catch(e){ S.rowMsg[id]={text:friendly(e),bad:true}; }
      delete S.busy[id]; draw(); notify(); reloadRollup();
    }
    async function save(id,field,inp){
      const it=S.items.find(i=>i.id===id); if(!it||!can()) return;
      let val;
      if(AMOUNT_FIELDS.includes(field)){
        const p=parseAmount(inp.value);
        if(!p.ok){ inp.classList.add('nbl-bad'); S.rowMsg[id]={text:'Not a number',bad:true}; const st=inp.closest('tr').querySelector('.nbl-st'); if(st){ st.textContent='Not a number'; st.classList.add('err'); } return; }
        val=p.val; inp.classList.remove('nbl-bad');
      } else if(field==='category_id'){ val=inp.value||null; }
      else { val=String(inp.value||'').trim()||null; }
      if((it[field]==null?null:it[field])===val) return;
      const prev=it[field], prevVar=it.variance_amount; it[field]=val;
      const patch={[field]:val,updated_at:new Date().toISOString()};
      if(AMOUNT_FIELDS.includes(field)){ it.variance_amount=calcVariance(it); patch.variance_amount=it.variance_amount; }
      S.busy[id]=true; S.rowMsg[id]=null; paintRow(id); paintTotals(); notify();
      try{
        const { error } = await sb.from('budget_line_items').update(patch).eq('id',id);
        if(error) throw error;
        S.rowMsg[id]={text:'Saved',bad:false}; reloadRollup();
      }catch(e){
        it[field]=prev; it.variance_amount=prevVar; S.rowMsg[id]={text:friendly(e),bad:true};
        if(el){ const bx=el.querySelector('tr[data-id="'+id+'"] [data-f="'+field+'"]'); if(bx) bx.value=prev==null?'':prev; }
      }
      delete S.busy[id]; paintRow(id); paintTotals(); notify();
    }
    async function reloadRollup(){
      if(!opts.showRollup||opts.parentType!=='campaign') return;
      try{ const { data } = await sb.from('campaign_budget_rollup').select('*').eq('campaign_id',opts.parentId).maybeSingle(); if(!S.dead){ S.roll=data||null; paintRoll(); } }catch(e){}
    }
    load();
    return { reload:load, totals:totals, attach(newEl){ if(S.dead) return; el=newEl; draw(); }, destroy(){ S.dead=true; if(el) el.innerHTML=''; } };
  }
  /* Page integration for pages that rebuild their detail dialogs wholesale on every render (Campaign Planning does):
     put <div id="nblHost" data-ptype="campaign|task" data-pid="<uuid>" data-org="<org uuid>" data-edit="1|0"></div> in the dialog,
     then call NorthBudgetLines.sync(sb, document.getElementById('nblHost')) after each render (host = null when no dialog is open).
     The same panel is re-attached to the new element without reloading; a different record or no host tears it down. */
  let live=null;
  function sync(sb,host,extra){
    try{
      if(!host){ if(live){ live.h.destroy(); live=null; } return; }
      const d=host.dataset||{}, key=(d.ptype||'')+':'+(d.pid||'');
      if(live&&live.key===key&&live.org===d.org){ live.h.attach(host); return; }
      if(live){ live.h.destroy(); live=null; }
      if(!d.ptype||!d.pid||!d.org) return;
      live={key:key,org:d.org,h:mount(host,Object.assign({sb:sb,orgId:d.org,parentType:d.ptype,parentId:d.pid,canEdit:d.edit==='1',showRollup:d.ptype==='campaign'},extra||{}))};
    }catch(e){ try{ console.warn('NorthBudgetLines.sync',e); }catch(_){} }
  }
  const api={mount:mount,sync:sync,_parseAmount:parseAmount};
  if(typeof window!=='undefined') window.NorthBudgetLines=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})();
