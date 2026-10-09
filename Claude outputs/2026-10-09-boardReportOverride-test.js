global.window=global; require('./braNew.js'); const A=window.NorthBoardReportAccess; let f=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)f++;};
// fake client: roles result + profiles result, logs queries
const mk=(roles,prof,log)=>({from:t=>({select:c=>({eq:(k,v)=>({limit:n=>{ if(log)log.push([t,c,k,v,n]); const r=t==='roles'?roles:prof; return typeof r==='function'?r():Promise.resolve(r);}})})})});
const roleOn={data:[{view_board_report:true}],error:null}, roleOff={data:[{view_board_report:false}],error:null};
const ov=v=>({data:[{board_report_override:v}],error:null});
(async()=>{
 let L=[],r;
 r=await A.load(mk(roleOff,ov(true),L),{roleId:'r',userId:'u'}); ok(r.allowed&&r.reason==='person override','override true beats role off'); ok(L.length===2&&L[1].join('|')==='profiles|board_report_override|id|u|1','reads only that person\'s override');
 r=await A.load(mk(roleOn,ov(false)),{roleId:'r',userId:'u'}); ok(!r.allowed&&r.reason==='person override','override false beats role on');
 r=await A.load(mk(roleOn,ov(null)),{roleId:'r',userId:'u'}); ok(r.allowed&&r.reason==='role','null follows role (on)');
 r=await A.load(mk(roleOff,ov(null)),{roleId:'r',userId:'u'}); ok(!r.allowed,'null follows role (off)');
 r=await A.load(mk(roleOn,{data:[],error:null}),{roleId:'r',userId:'u'}); ok(r.allowed,'no profile row -> follows role');
 r=await A.load(mk(roleOn,ov(false)),{roleId:'r',userId:'u',isPlatformAdmin:true}); ok(r.allowed&&r.reason==='platform admin','platform admin ignores a block');
 L=[]; r=await A.load(mk(roleOn,ov(false),L),{roleId:'r',userId:'u',isPlatformAdmin:true}); ok(L.length===1,'platform admin: no extra query');
 r=await A.load(mk(roleOff,{data:null,error:{code:'42703',message:'column profiles.board_report_override does not exist'}}),{roleId:'r',userId:'u'}); ok(!r.allowed&&r.enforced&&r.reason==='role not approved','override column missing -> ignored, role decides (off)');
 r=await A.load(mk(roleOn,{data:null,error:{code:'PGRST204',message:"Could not find the 'board_report_override' column of 'profiles' in the schema cache"}}),{roleId:'r',userId:'u'}); ok(r.allowed,'override column missing (PostgREST form) -> role decides (on)');
 r=await A.load(mk(roleOn,{data:null,error:{code:'57014',message:'statement timeout'}}),{roleId:'r',userId:'u'}); ok(!r.allowed&&r.enforced,'other error reading override -> fails CLOSED');
 r=await A.load(mk(roleOn,()=>Promise.reject(new Error('network'))),{roleId:'r',userId:'u'}); ok(!r.allowed&&/network/.test(r.reason),'network failure on override -> fails closed');
 r=await A.load({from:t=>{ if(t==='roles') return {select:()=>({eq:()=>({limit:()=>Promise.resolve(roleOn)})})}; throw new Error('boom'); }},{roleId:'r',userId:'u'}); ok(!r.allowed,'sync throw on override query -> fails closed');
 r=await A.load(mk(roleOff,ov(true)),{roleId:'r',userOverride:false,userId:'u'}); ok(!r.allowed,'explicit userOverride wins over userId lookup');
 r=await A.load(mk(roleOn,ov(false)),{roleId:'r'}); ok(r.allowed,'no userId and no userOverride -> role only (unchanged behaviour)');
 r=await A.load(mk({data:null,error:{code:'42703',message:'x'}},ov(true)),{roleId:'r',userId:'u'}); ok(!r.enforced&&r.allowed,'role flag column missing -> feature off regardless of override');
 console.log(f?'FAILED '+f:'ALL PASS'); process.exit(f?1:0);
})();
