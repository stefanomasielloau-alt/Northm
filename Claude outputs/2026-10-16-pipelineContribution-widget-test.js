// Renders Strategy's Board report "Contribution to closed pipeline" widget with stand-ins. node "Claude outputs/2026-10-16-pipelineContribution-widget-test.js"
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..'), h = fs.readFileSync(path.join(root, 'Strategy.html'), 'utf8');
const i = h.indexOf('function _pcScoped('), j = h.indexOf('window.boardReportWidgetContribution=');
const ctx = { console, window: {}, globalThis: null };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'shared/boardPeriod.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'shared/pipelineContribution.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'shared/convertToMain.js'), 'utf8') + ';this.convertToMain=convertToMain;', ctx);
vm.runInContext(`
var NorthBoardPeriod=window.NorthBoardPeriod||globalThis.NorthBoardPeriod, NorthPipelineContribution=window.NorthPipelineContribution||globalThis.NorthPipelineContribution;
var CFG={currency:{main:'AUD',rates:[{code:'USD',rate:1.5}]},time:{fyStartMonth:7},campaigns:[{id:'c1',name:'One',regionId:'r1',start:'2026-07-01',end:'2027-06-30'},{id:'c2',name:'Two',regionId:'r2'}],attributionModel:'multi_touch'};
var UI={fy:'FY27'}; var REG=[{id:'r1'},{id:'r2'}], VIS=REG;
function R(){return REG} function visibleRegions(){return VIS}
function brPer(){return {from:0,to:11,months:12,isFull:true}} function brLabel(){return 'FY27'}
function campaignActualSpend(c){return c.id==='c1'?1000:0}
var F={mk:v=>'$'+Math.round(v)}; function esc(s){return String(s).replace(/</g,'&lt;')} var sb={};
` + h.slice(i, j) + `
CFG.pc={loaded:true,touchesAvailable:true,deals:[
 {id:'d1',name:'Alpha',value:2000,currency:'AUD',stage:'Closed Won',close_date:'2026-09-01',campaign_id:'c1'},
 {id:'d2',name:'Beta',value:1000,currency:'USD',stage:'Closed Won',close_date:'2026-10-01',campaign_id:'c2',attribution_source:'partner_sourced'},
 {id:'d3',name:'Gamma',value:500,currency:'GBP',stage:'Closed Won',close_date:'2026-10-02',campaign_id:null}],
 touches:[{deal_id:'d1',campaign_id:'c2',role:'influenced',weight:1}]};
globalThis.out1=boardReportWidgetContribution();
VIS=[{id:'r1'}]; globalThis.out2=boardReportWidgetContribution();
CFG.pc.loaded=false; globalThis.out3=boardReportWidgetContribution();
`, ctx);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const o1 = ctx.out1, o2 = ctx.out2;
ok(/Contribution to closed pipeline/.test(o1), 'title');
ok(/\$3500/.test(o1) && /87.5%/.test(o1) && /\$4000/.test(o1), 'credited 3500 of 4000 (GBP 1:1 = 500 unattributed) ' + (o1.match(/<b>[\d.]+%<\/b>/) || [])[0]);
ok(/No exchange rate set for GBP/.test(o1), 'missing rate warned');
ok(/Partner-sourced/.test(o1) && /Gamma/.test(o1) && /link them to a campaign in Scoring/.test(o1), 'partner + unlinked list');
ok(/Return on spend: <b>3.50/.test(o1), 'return on spend 3500/1000');
ok(/regions you can see/.test(o2), 'scope note when region-limited');
ok(/could not be read/.test(ctx.out3), 'fail-soft');
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
