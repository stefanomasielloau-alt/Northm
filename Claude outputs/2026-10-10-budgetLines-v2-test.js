const {chromium}=require('playwright');
let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const pg=await b.newPage({viewport:{width:1300,height:800}});
const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
pg.on('dialog',d=>d.accept());
await pg.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
await pg.setContent('<!doctype html><html><head></head><body><div id="a"></div><div id="b"></div><div id="c"></div></body></html>');
await pg.addScriptTag({path:'/tmp/claude-0/-home-claude/e010ecd8-2d8f-5e8d-8239-89e22e4052da/scratchpad/bl/budgetLines.js'});
// fake supabase with a tiny in-memory db + call log
await pg.evaluate(()=>{
  const DB={budget_line_categories:[{id:'c1',name:'Media',sort_order:1,org_id:'o1'},{id:'c2',name:'Creative',sort_order:2,org_id:'o1'}],
    budget_line_items:[{id:'i1',org_id:'o1',parent_type:'campaign',parent_id:'p1',category_id:'c1',description:'Search ads',planned_amount:1000,quoted_amount:null,approved_amount:900,committed_amount:null,actual_amount:250.5,variance_amount:null,variance_reason:null,sort_order:1,created_at:'2026-01-01'},
                       {id:'i2',org_id:'o1',parent_type:'campaign',parent_id:'p1',category_id:null,description:'Design',planned_amount:500,quoted_amount:null,approved_amount:null,committed_amount:null,actual_amount:null,variance_amount:null,variance_reason:null,sort_order:2,created_at:'2026-01-02'},
                       {id:'i9',org_id:'o1',parent_type:'campaign',parent_id:'OTHER',description:'Not mine',planned_amount:7,sort_order:1,created_at:'2026-01-03'}],
    campaign_budget_rollup:[{campaign_id:'p1',org_id:'o1',planned_total:2000,quoted_total:0,approved_total:900,committed_total:0,actual_total:250.5,variance_total:0,line_item_count:3}]};
  window.__DB=DB; window.__log=[]; window.__fail=null; window.__n=100; window.__lat=0;
  function q(table){
    const S={table,filters:[],op:'select',payload:null,single:false,maybe:false};
    const run=()=>{
      __log.push({table,op:S.op,payload:S.payload,filters:S.filters.map(f=>f.join('='))});
      if(__fail) return Promise.resolve({data:null,error:__fail});
      const rows=DB[table]; if(!rows) return Promise.resolve({data:null,error:{code:'42P01',message:'relation does not exist'}});
      const match=r=>S.filters.every(([k,v])=>r[k]===v);
      if(S.op==='select'){ let d=rows.filter(match); return Promise.resolve({data:S.maybe?(d[0]||null):d,error:null}); }
      if(S.op==='insert'){ const r=Object.assign({id:'n'+(++__n),created_at:'2026-02-01',planned_amount:null,quoted_amount:null,approved_amount:null,committed_amount:null,actual_amount:null,variance_amount:null},S.payload); rows.push(r); return Promise.resolve({data:S.single?r:[r],error:null}); }
      if(S.op==='update'){ rows.filter(match).forEach(r=>Object.assign(r,S.payload)); return Promise.resolve({data:null,error:null}); }
      if(S.op==='delete'){ DB[table]=rows.filter(r=>!match(r)); return Promise.resolve({data:null,error:null}); }
    };
    const o={select(){ if(S.op==='select')S.op='select'; return o; },insert(p){S.op='insert';S.payload=p;return o;},update(p){S.op='update';S.payload=p;return o;},delete(){S.op='delete';return o;},
      eq(k,v){S.filters.push([k,v]);return o;},order(){return o;},single(){S.single=true;return o;},maybeSingle(){S.maybe=true;return o;},
      then(res,rej){return new Promise(r=>setTimeout(r,window.__lat||0)).then(run).then(res,rej);}};
    return o;
  }
  window.__sb={from:q};
});
const M=(sel,extra)=>pg.evaluate(([sel,extra])=>{window.__h=NorthBudgetLines.mount(document.querySelector(sel),Object.assign({sb:__sb,orgId:'o1',parentType:'campaign',parentId:'p1',canEdit:true,showRollup:true,onChange:t=>{window.__tot=t}},extra||{}));},[sel,extra]);
const txt=sel=>pg.$eval(sel,e=>e.innerText.replace(/\s+/g,' '));
await M('#a'); await pg.waitForSelector('#a tr[data-id]');
ok(await pg.$$eval('#a tr[data-id]',r=>r.length)===2,'loads only this campaign\'s 2 lines (not the other campaign\'s)');
let t=await pg.evaluate(()=>__tot); ok(t.count===2&&t.planned===1500&&t.approved===900&&t.actual===250.5,'totals: '+JSON.stringify(t));
ok(/Including tasks/.test(await txt('#a'))&&/2,000/.test(await txt('#a')),'rollup row appears when tasks add lines (3 > 2)');
ok(await pg.$eval('#a tr[data-id="i1"] select',s=>s.selectedOptions[0].textContent)==='Media','category preselected');
// edit amount
await pg.fill('#a tr[data-id="i2"] [data-f="planned_amount"]','$2,500.25'); await pg.press('#a tr[data-id="i2"] [data-f="planned_amount"]','Tab');
await pg.waitForFunction(()=>__DB.budget_line_items.find(r=>r.id==='i2').planned_amount===2500.25);
ok(true,'"$2,500.25" saved as 2500.25');
t=await pg.evaluate(()=>__tot); ok(t.planned===3500.25,'totals update after edit: '+t.planned);
// bracket negative on a real amount box
await pg.fill('#a tr[data-id="i1"] [data-f="quoted_amount"]','(50)'); await pg.press('#a tr[data-id="i1"] [data-f="quoted_amount"]','Tab');
await pg.waitForFunction(()=>__DB.budget_line_items.find(r=>r.id==='i1').quoted_amount===-50);
ok(true,'"(50)" saved as -50');
ok(await pg.$('#a tr[data-id="i1"] [data-f="variance_amount"]')===null,'variance has no input box (cannot be edited)');
ok((await txt('#a tr[data-id="i1"] td[data-var]'))==='-$649.5','variance auto = Actual 250.5 - Approved 900 = -$649.5, got '+await txt('#a tr[data-id="i1"] td[data-var]'));
ok(await pg.evaluate(()=>__DB.budget_line_items.find(r=>r.id==='i1').variance_amount)===-649.5,'calculated variance also saved to variance_amount (roll-up view stays consistent)');
ok(await pg.$eval('#a tr[data-id="i1"] td[data-var]',e=>e.classList.contains('under')),'under budget styled as under');
ok((await txt('#a tr[data-id="i2"] td[data-var]'))==='—','variance blank while there is no Actual/Committed');
// invalid
const before=await pg.evaluate(()=>__log.length);
await pg.fill('#a tr[data-id="i1"] [data-f="actual_amount"]','abc'); await pg.press('#a tr[data-id="i1"] [data-f="actual_amount"]','Tab');
await pg.waitForTimeout(150);
ok(await pg.evaluate(()=>__log.length)===before,'non-numeric not sent to the database');
ok(/Not a number/.test(await txt('#a tr[data-id="i1"]')),'"Not a number" shown on the row');
// clear amount -> null
await pg.fill('#a tr[data-id="i1"] [data-f="approved_amount"]',''); await pg.press('#a tr[data-id="i1"] [data-f="approved_amount"]','Tab');
await pg.waitForFunction(()=>__DB.budget_line_items.find(r=>r.id==='i1').approved_amount===null);
ok(true,'blank amount saved as null (not 0)');
// text + category
await pg.fill('#a tr[data-id="i1"] [data-f="description"]','  Search + social '); await pg.press('#a tr[data-id="i1"] [data-f="description"]','Tab');
await pg.waitForFunction(()=>__DB.budget_line_items.find(r=>r.id==='i1').description==='Search + social');
ok(true,'description trimmed and saved');
await pg.selectOption('#a tr[data-id="i2"] select','c2');
await pg.waitForFunction(()=>__DB.budget_line_items.find(r=>r.id==='i2').category_id==='c2');
ok(true,'category change saved');
// no-op does not write
const l2=await pg.evaluate(()=>__log.length);
await pg.focus('#a tr[data-id="i2"] [data-f="description"]'); await pg.press('#a tr[data-id="i2"] [data-f="description"]','Tab'); await pg.waitForTimeout(100);
ok(await pg.evaluate(()=>__log.length)===l2,'unchanged field does not write');
// add
await pg.click('#a [data-a="add"]'); await pg.waitForFunction(()=>document.querySelectorAll('#a tr[data-id]').length===3);
const ins=await pg.evaluate(()=>__log.filter(l=>l.op==='insert').pop().payload);
ok(ins.org_id==='o1'&&ins.parent_type==='campaign'&&ins.parent_id==='p1'&&ins.sort_order===3,'insert carries org, parent and next sort_order: '+JSON.stringify(ins));
// delete
await pg.click('#a tr[data-id]:last-child [data-a="del"]'); await pg.waitForFunction(()=>document.querySelectorAll('#a tr[data-id]').length===2);
ok(await pg.evaluate(()=>!__DB.budget_line_items.some(r=>r.id.startsWith('n'))),'delete removes the row from the DB');
// html escaping
await pg.evaluate(()=>{__DB.budget_line_items.find(r=>r.id==='i2').description='<img src=x onerror=window.__xss=1>"q"'; __h.reload();});
await pg.waitForFunction(()=>document.querySelector('#a tr[data-id="i2"] [data-f="description"]').value.startsWith('<img'));
ok(await pg.evaluate(()=>!window.__xss&&!document.querySelector('#a img')),'description is escaped (no injected markup)');
// save failure reverts
await pg.evaluate(()=>{__fail={code:'42501',message:'new row violates row-level security'}});
await pg.fill('#a tr[data-id="i1"] [data-f="committed_amount"]','77'); await pg.press('#a tr[data-id="i1"] [data-f="committed_amount"]','Tab');
await pg.waitForFunction(()=>/permission/.test(document.querySelector('#a tr[data-id="i1"]').innerText));
ok(await pg.$eval('#a tr[data-id="i1"] [data-f="committed_amount"]',e=>e.value)==='','failed save reverts the box and says no permission');
await pg.evaluate(()=>{__fail=null});
// ---- 2026-10-10: Tab keeps working with a slow database; variance recalculates live ----
await pg.evaluate(()=>{__lat=250});
await pg.fill('#a tr[data-id="i2"] [data-f="approved_amount"]','2000'); await pg.press('#a tr[data-id="i2"] [data-f="approved_amount"]','Tab');
const act=()=>pg.evaluate(()=>{const a=document.activeElement; return a&&a.closest('tr')?a.getAttribute('data-f')+'@'+a.closest('tr').getAttribute('data-id'):String(a&&a.tagName)});
let ae=await act(); ok(ae==='committed_amount@i2','Tab moves focus to the next box (got '+ae+')');
await pg.keyboard.type('2050'); await pg.keyboard.press('Tab');
ae=await act(); ok(ae==='actual_amount@i2','typed in the next box while the first save was still in flight; Tab moved on (got '+ae+')');
await pg.keyboard.type('2100'); await pg.keyboard.press('Tab');
await pg.waitForFunction(()=>{const r=__DB.budget_line_items.find(r=>r.id==='i2');return r.actual_amount===2100&&r.committed_amount===2050&&r.approved_amount===2000});
ok(true,'all three boxes saved with the right values');
await pg.waitForTimeout(700);
ok(await pg.$eval('#a tr[data-id="i2"] [data-f="committed_amount"]',e=>e.value)==='2050','values still in the boxes after saves return (no wipe)');
ok((await txt('#a tr[data-id="i2"] td[data-var]'))==='+$100','variance recalculates: Actual 2100 - Approved 2000 = +$100');
ok(await pg.$eval('#a tr[data-id="i2"] td[data-var]',e=>e.classList.contains('over')),'over budget styled as over');
ok(await pg.evaluate(()=>__DB.budget_line_items.find(r=>r.id==='i2').variance_amount)===100,'variance 100 stored');
await pg.fill('#a tr[data-id="i2"] [data-f="actual_amount"]',''); await pg.press('#a tr[data-id="i2"] [data-f="actual_amount"]','Tab');
await pg.waitForFunction(()=>__DB.budget_line_items.find(r=>r.id==='i2').actual_amount===null);
ok((await txt('#a tr[data-id="i2"] td[data-var]'))==='+$50','no Actual: variance uses Committed (2050-2000=+$50)');
await pg.waitForTimeout(500); await pg.evaluate(()=>{__lat=0});
ok(/\$/.test(await txt('#a tfoot td[data-t="variance"]')),'footer variance total shown: '+await txt('#a tfoot td[data-t="variance"]'));
await pg.click('#a [data-a="add"]'); await pg.waitForFunction(()=>document.querySelectorAll('#a tr[data-id]').length===3);
ok(await pg.evaluate(()=>document.activeElement&&document.activeElement.getAttribute('data-f')==='description'),'Add line puts the cursor in the new line Description');
await pg.click('#a tr[data-id]:last-child [data-a="del"]'); await pg.waitForFunction(()=>document.querySelectorAll('#a tr[data-id]').length===2);
await pg.evaluate(()=>{ __DB.campaign_budget_rollup.push({campaign_id:'p2',org_id:'o1',planned_total:900,quoted_total:0,approved_total:0,committed_total:0,actual_total:0,variance_total:0,line_item_count:2}); document.body.insertAdjacentHTML('beforeend','<div id="d"></div>'); NorthBudgetLines.mount(document.querySelector('#d'),{sb:__sb,orgId:'o1',parentType:'campaign',parentId:'p2',canEdit:true,showRollup:true}); });
await pg.waitForFunction(()=>/Including tasks/.test(document.querySelector('#d').innerText));
ok(/belong to its activities/.test(await txt('#d'))&&/\$900/.test(await txt('#d')),'no own lines but task lines: roll-up totals shown with an explanation');
// read-only
await M('#b',{canEdit:false}); await pg.waitForSelector('#b tr[data-id]');
ok(await pg.$$eval('#b input,#b select',a=>a.every(x=>x.disabled)),'read-only: every input disabled');
ok(await pg.$('#b [data-a="add"]')===null&&await pg.$('#b [data-a="del"]')===null,'read-only: no Add/Delete buttons');
// empty state + missing tables
await M('#c',{parentId:'EMPTYP',showRollup:false}); await pg.waitForFunction(()=>/No line items yet/.test(document.querySelector('#c').innerText));
ok(/totals read 0/.test(await txt('#c')),'zero line items is a valid state');
await pg.evaluate(()=>{window.__keep=__DB.budget_line_items; delete __DB.budget_line_items;});
await pg.evaluate(()=>{window.__h.reload()}); await pg.evaluate(()=>NorthBudgetLines.mount(document.querySelector('#c'),{sb:__sb,orgId:'o1',parentType:'task',parentId:'t1',canEdit:true}));
await pg.waitForFunction(()=>/not installed/.test(document.querySelector('#c').innerText));
ok(await pg.$('#c [data-a="add"]')===null,'tables missing: friendly message, no Add button');

// ---- sync() page integration ----
await pg.evaluate(()=>{ __DB.budget_line_items=window.__keep; document.body.insertAdjacentHTML('beforeend','<div id="dlg"></div>'); });
const mk=(pid,edit)=>pg.evaluate(([pid,edit])=>{ document.getElementById('dlg').innerHTML='<div id="nblHost" data-ptype="campaign" data-pid="'+pid+'" data-org="o1" data-edit="'+edit+'"></div>'; NorthBudgetLines.sync(__sb,document.getElementById('nblHost')); },[pid,edit]);
await mk('p1','1'); await pg.waitForSelector('#dlg tr[data-id]');
ok(await pg.$$eval('#dlg tr[data-id]',r=>r.length)===2,'sync: first call mounts and loads the panel');
const q0=await pg.evaluate(()=>__log.length);
await mk('p1','1'); await pg.waitForSelector('#dlg tr[data-id]');
ok(await pg.evaluate(()=>__log.length)===q0,'sync: page re-render of the dialog re-attaches with NO new queries');
ok(await pg.$$eval('#dlg [data-a="add"]',a=>a.length)===1,'sync: still editable after re-attach');
await mk('p1','0'); await pg.waitForSelector('#dlg tr[data-id]');
await pg.evaluate(()=>NorthBudgetLines.sync(__sb,null)); ok(await pg.$eval('#dlg',e=>e.innerText.trim())==='','sync: null host tears down without error');
await mk('OTHERP','1'); await pg.waitForFunction(()=>/No line items yet/.test(document.querySelector('#dlg').innerText));
ok(true,'sync: different record loads fresh (empty state)');
await mk('not-a-uuid','1');
await pg.evaluate(()=>{ __fail={code:'22P02',message:'invalid input syntax for type uuid: "not-a-uuid"'}; NorthBudgetLines.sync(__sb,null); document.getElementById('dlg').innerHTML='<div id="nblHost" data-ptype="task" data-pid="tmp1" data-org="o1" data-edit="1"></div>'; NorthBudgetLines.sync(__sb,document.getElementById('nblHost')); });
await pg.waitForFunction(()=>/not been saved yet/.test(document.querySelector('#dlg').innerText));
ok(true,'sync: unsaved (non-uuid) record shows a plain "save it first" message');
await pg.evaluate(()=>{__fail=null});
ok(errs.length===0,'no page errors '+errs.join(';'));
console.log(f?('FAILED '+f):'ALL PASS'); await b.close(); process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
