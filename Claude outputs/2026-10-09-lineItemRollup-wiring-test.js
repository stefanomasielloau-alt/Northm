const fs=require('fs');
const src=fs.readFileSync('/mnt/user-data/uploads/Northm/Strategy.html.new','utf8');
let f=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) f++;};
const cut=(a,b)=>{const i=src.indexOf(a); const j=src.indexOf(b,i); if(i<0||j<0) throw new Error('marker '+a); return src.slice(i,j);};
// helpers block
const helpers=cut('function liFig(camp,k)','function campaignBudgetMain')+src.slice(src.indexOf('function campaignBudgetMain'),src.indexOf('\n',src.indexOf('function campaignBudgetMain')));
// load block
const loadBlk=cut('  try{\n    if(window.NorthLineItemRollup){','  CFG.campaignPodAllocations = ');
globalThis.window=globalThis; require('/mnt/user-data/outputs/lineItemRollup.js');
globalThis.F={mk:v=>'$'+Math.round(v)};
eval(helpers.replace(/function (\w+)/g,'globalThis.$1=function $1'));
const mkSb=(tables,fail)=>({from:t=>{ const rows=tables[t]; let lo=0,hi=1e9; const q={select(){return q},order(){return q},range(a,b){lo=a;hi=b;return q},then(res){ if(fail&&fail[t]) return res({error:{message:'x'}}); res({data:rows.slice(lo,hi+1)}); }}; return q; }});
async function load(tables,fail){
  const CFG={campaigns:[{id:'c1',budget:5000,committed:2000,actual:1000},{id:'c2',budget:300}]};
  const sb=mkSb(tables,fail); const orgScoped=q=>q;
  await eval('(async()=>{'+loadBlk+'})()');
  return CFG;
}
(async()=>{
  const lines=[{id:'a',parent_type:'campaign',parent_id:'c1',planned_amount:1000,approved_amount:800,committed_amount:700,actual_amount:100},{id:'b',parent_type:'task',parent_id:'t1',planned_amount:200}];
  const tasks=[{id:'t1',campaign_id:'c1'}];
  let C=await load({budget_line_items:lines,tasks});
  ok(C.campaigns[0].li&&C.campaigns[0].li.n===2&&!C.campaigns[1].li,'lines attach to the right campaign (incl. via task); c2 untouched');
  ok(campaignBudgetMain(C.campaigns[0])===1000&&campaignCommitted(C.campaigns[0])===700&&campaignActualSpend(C.campaigns[0])===100,'c1 figures from lines (800+200, 700, 100)');
  ok(campaignBudgetMain(C.campaigns[1])===300&&campaignCommitted(C.campaigns[1])===0,'c2 unchanged (no lines)');
  ok(liHint(C.campaigns[0],'budget').includes('from line items: $1000')&&liHint(C.campaigns[1],'budget')==='','hint shows only where lines drive the figure');
  C=await load({budget_line_items:lines,tasks},{budget_line_items:1});
  ok(!C.campaigns[0].li&&campaignBudgetMain(C.campaigns[0])===5000,'lines query error -> no change, no throw');
  C=await load({budget_line_items:[],tasks});
  ok(!C.campaigns[0].li,'zero lines -> no change');
  C=await load({budget_line_items:lines,tasks},{tasks:1});
  ok(C.campaigns[0].li&&C.campaigns[0].li.n===1&&campaignBudgetMain(C.campaigns[0])===800,'tasks query error -> campaign-level lines still used');
  // paging: 2500 lines
  const many=[];for(let i=0;i<2500;i++) many.push({id:'i'+String(i).padStart(5,'0'),parent_type:'campaign',parent_id:'c1',planned_amount:1});
  C=await load({budget_line_items:many,tasks});
  ok(C.campaigns[0].li.n===2500&&campaignBudgetMain(C.campaigns[0])===2500,'2500 lines are all read (paged)');
  console.log(f?'FAILED '+f:'ALL PASS'); process.exit(f?1:0);
})().catch(e=>{console.log('ERR',e);process.exit(1)});
