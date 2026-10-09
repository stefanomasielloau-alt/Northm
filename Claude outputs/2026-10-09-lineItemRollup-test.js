require('./lineItemRollup.js');
const R=globalThis.NorthLineItemRollup; let f=0;
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) f++;};
const lines=[
 {parent_type:'campaign',parent_id:'c1',planned_amount:1000,approved_amount:900,committed_amount:800,actual_amount:null},
 {parent_type:'campaign',parent_id:'c1',planned_amount:500,approved_amount:null,committed_amount:null,actual_amount:120},
 {parent_type:'task',parent_id:'t1',planned_amount:'200',approved_amount:'',committed_amount:50,actual_amount:25},
 {parent_type:'task',parent_id:'tX',planned_amount:999},              // task with no campaign -> ignored
 {parent_type:'campaign',parent_id:'c2',planned_amount:null,approved_amount:null,committed_amount:70,actual_amount:null}, // only committed
 {parent_type:'campaign',parent_id:'c3'},                              // empty line
 null,{parent_type:'bogus',parent_id:'c1',planned_amount:5}
];
const tasks=[{id:'t1',campaign_id:'c1'},{id:'t2',campaign_id:'c9'},{id:'tX',campaign_id:null}];
const m=R.build(lines,tasks);
ok(m.c1.n===3,'c1 has 3 lines (2 own + 1 task line)');
ok(m.c1.budget===900+500+200,'budget = approved else planned per line (900+500+200)');
ok(m.c1.committed===850&&m.c1.hasCommitted,'committed sums 800+50');
ok(m.c1.actual===145&&m.c1.hasActual,'actual sums 120+25');
ok(m.c2.hasCommitted&&!m.c2.hasBudget&&!m.c2.hasActual,'c2 only has committed -> budget/actual fall back');
ok(R.figure({li:m.c2},'budget')===null&&R.figure({li:m.c2},'committed')===70,'figure(): null when stage not filled, number when it is');
ok(m.c3.n===1&&!m.c3.hasBudget&&!m.c3.hasCommitted&&!m.c3.hasActual,'empty line counts as a line but supplies no figure');
ok(!m.tX&&!m.c9,'orphan task lines ignored; tasks without lines create nothing');
ok(R.figure({},'budget')===null&&R.figure(null,'actual')===null,'no li -> null (today\'s behaviour)');
ok(R.build(null,null) && Object.keys(R.build(null,null)).length===0,'null input -> empty map');
ok(R.figure({li:{hasBudget:true,budget:0}},'budget')===0,'a real zero is a real figure (not treated as missing)');
// Strategy helper simulation (same expressions as the patch)
const LI=(camp,k)=>(typeof NorthLineItemRollup!=='undefined'&&NorthLineItemRollup.figure)?NorthLineItemRollup.figure(camp,k):null;
function campaignCommitted(camp){ const l=LI(camp,'committed'); if(l!=null) return l; return camp.rollupCommitted!=null ? camp.rollupCommitted : (camp.committed||0); }
function campaignActualSpend(camp){ const l=LI(camp,'actual'); if(l!=null) return l; return camp.rollupActual!=null ? camp.rollupActual : (camp.actual||0); }
function campaignBudgetMain(c){ const l=LI(c,'budget'); if(l!=null) return l; return (c.budgetFx && c.budgetFx.converted!=null) ? c.budgetFx.converted : (c.budget||0); }
const noLines={budget:5000,committed:2000,actual:1000,rollupCommitted:1500,rollupActual:900,budgetFx:{converted:5200}};
ok(campaignBudgetMain(noLines)===5200&&campaignCommitted(noLines)===1500&&campaignActualSpend(noLines)===900,'no line items: figures identical to today (fx budget, rollup committed/actual)');
const withLines=Object.assign({},noLines,{li:m.c1});
ok(campaignBudgetMain(withLines)===1600&&campaignCommitted(withLines)===850&&campaignActualSpend(withLines)===145,'with line items: figures come from lines');
const partial=Object.assign({},noLines,{li:m.c2});
ok(campaignBudgetMain(partial)===5200&&campaignCommitted(partial)===70&&campaignActualSpend(partial)===900,'only committed filled: committed from lines, budget/actual unchanged');
console.log(f?'FAILED '+f:'ALL PASS'); process.exit(f?1:0);
