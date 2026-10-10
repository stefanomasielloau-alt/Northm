const fs=require('fs'); global.window=undefined; eval(fs.readFileSync(process.argv[2]||'lineItemRollup.js','utf8')); const R=globalThis.NorthLineItemRollup;
let f=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)f++}; const eq=(a,b,m)=>ok(Math.abs(a-b)<1e-9,m+' ('+a+' vs '+b+')');
const L=(pt,pid,o)=>Object.assign({parent_type:pt,parent_id:pid,planned_amount:null,approved_amount:null,committed_amount:null,actual_amount:null},o);
// activity: lines replace typed per stage
let idx=R.index([L('task','t1',{planned_amount:1000,committed_amount:600}),L('task','t1',{planned_amount:500,actual_amount:200})]);
eq(R.taskFig(idx,'t1','planned',9999),1500,'activity Planned = sum of line Planned, ignoring typed');
eq(R.taskFig(idx,'t1','committed',9999),600,'activity Committed = sum of line Committed');
eq(R.taskFig(idx,'t1','actual',9999),200,'activity Actual = sum of line Actual');
eq(R.taskFig(idx,'t2','committed',777),777,'activity with no lines keeps its typed number');
idx=R.index([L('task','t1',{planned_amount:1000})]);
eq(R.taskFig(idx,'t1','committed',300),300,'stage with no line value falls back to typed for that stage only');
ok(R.taskHasLines(idx,'t1','planned')&&!R.taskHasLines(idx,'t1','committed'),'taskHasLines is per stage');
idx=R.index([L('task','t1',{actual_amount:0})]);
eq(R.taskFig(idx,'t1','actual',500),0,'an explicit zero line is a real value (not "blank")');
// campaign: activities (lines-else-typed) + campaign-only lines
idx=R.index([L('task','t1',{committed_amount:600,actual_amount:100}),L('campaign','c1',{committed_amount:400,planned_amount:2000,approved_amount:1800})]);
const tasks=[{id:'t1',planned:50,committed:9999,actual:9999},{id:'t2',planned:70,committed:250,actual:80}];
let f1=R.campaignFigs(idx,'c1',tasks);
eq(f1.committed,600+250+400,'campaign Committed = t1 lines 600 + t2 typed 250 + campaign lines 400');
eq(f1.actual,100+80,'campaign Actual = t1 lines 100 + t2 typed 80 (no campaign actual line)');
eq(f1.planned,50+70+2000,'campaign Planned = typed 50 (t1 has no planned line) + 70 + campaign planned line 2000');
eq(f1.allocated,1800,'allocated = Approved else Planned: campaign line approved 1800 (t1 has no budget lines)');
ok(f1.hasAllocated&&f1.hasCommitted&&f1.hasActual,'has flags set when any line supplies the stage');
f1=R.campaignFigs(R.index([]),'c1',tasks); eq(f1.committed,9999+250,'no lines at all = typed sums'); ok(!f1.hasAllocated&&!f1.hasCommitted&&f1.n===0,'no lines: flags false');
// allocated per-line approved-else-planned across levels
idx=R.index([L('campaign','c1',{planned_amount:100,approved_amount:90}),L('task','t1',{planned_amount:50}),L('task','t1',{quoted_amount:7})]);
eq(R.campaignFigs(idx,'c1',[{id:'t1'}]).allocated,140,'allocated = 90 (approved beats planned) + 50 (planned) ; quoted-only line adds nothing');
// build / figure (Strategy)
const lines=[L('task','t1',{committed_amount:600}),L('campaign','c1',{committed_amount:400})];
const lm=R.build(lines,[{id:'t1',campaign_id:'c1',committed_cost:1,actual_cost:70},{id:'t2',campaign_id:'c1',committed_cost:250,actual_cost:80}]);
eq(lm.c1.committed,1250,'build: committed = 600 + 250 typed + 400 campaign'); ok(lm.c1.hasCommitted&&!lm.c1.hasActual,'build: hasActual false (no actual line) so Strategy keeps its snapshot for Actual');
eq(R.figure({li:lm.c1,budget:0},'committed'),1250,'figure committed'); ok(R.figure({li:lm.c1},'actual')===null,'figure actual null when no actual lines');
const lb=R.build([L('campaign','c1',{planned_amount:300})],[]);
eq(R.figure({li:lb.c1,budget:0},'budget'),300,'figure budget: typed Budget empty -> allocated total');
ok(R.figure({li:lb.c1,budget:5000},'budget')===null,'figure budget: typed envelope present -> null (Strategy keeps the envelope)');
ok(R.figure({budget:5},'budget')===null&&R.figure(null,'actual')===null,'no li / no camp -> null');
ok(R.build([L('task','ghost',{actual_amount:5})],[{id:'t1',campaign_id:'c1'}]).c1===undefined,'orphan task lines (task not in list) ignored');
ok(Object.keys(R.build([],[{id:'t1',campaign_id:'c1',committed_cost:5}])).length===0,'campaign without any lines is absent (figures unchanged)');
ok(R.build(null,null)&&Object.keys(R.build(null,null)).length===0,'null inputs safe');
console.log(f?'FAILED '+f:'ALL PASS'); process.exit(f?1:0);
