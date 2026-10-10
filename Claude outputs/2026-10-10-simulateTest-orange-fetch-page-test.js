const {chromium}=require('playwright'); const fs=require('fs');
const src=fs.readFileSync('/mnt/user-data/uploads/Northm/ProcessMaps.html.new','utf8');
const a1=src.indexOf('function flSimStep(S){'), a2=src.indexOf('function flSimRun(S){'), a2e=src.indexOf('\n',a2);
const WRAP=src.slice(a1,a2e);
const b1=src.indexOf('const FLOW_TEST_FN_MISSING'), b2=src.indexOf('window.flSimSendTest=flSimSendTest;')+'window.flSimSendTest=flSimSendTest;'.length;
const PANEL=src.slice(b1,b2);
const noteStart=src.indexOf('<b>Simulate never sends anything</b>');
let f=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)f++};
ok(noteStart>0&&/Send test email to me/.test(src.slice(noteStart,noteStart+300)),'Simulate note says nothing is sent and points to the test button');
ok(/Why did I not get the email when I simulated/.test(src),'FAQ entry added');
(async()=>{ const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}); const pg=await b.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 const calls=[]; let mode='ok';
 await pg.route('http://t.local/**',async r=>{ const u=r.request().url();
   if(u.includes('/functions/v1/flow-test-send')&&mode==='preflight'){ if(r.request().method()==='POST') return r.abort('failed'); return r.fulfill({status:404,contentType:'application/json',body:'{"code":"NOT_FOUND"}'}); }
   if(u.includes('/functions/v1/flow-test-send')&&mode==='preflight2'){ if(r.request().method()==='POST') return r.abort('failed'); return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); }
   if(u.includes('/functions/v1/flow-test-send')){ calls.push({auth:r.request().headers()['authorization'],body:JSON.parse(r.request().postData()||'{}')});
     if(mode==='missing') return r.fulfill({status:404,contentType:'application/json',body:'{}'});
     if(mode==='hubfail') return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:false,error:'The sending account has no email method connected'})});
     if(mode==='replay') return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,to:'stef@example.com',detail:'Sent 1/1 via gmail',replayed:true})});
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,to:'stef@example.com',detail:'Sent 1/1 via gmail'})}); }
   return r.fulfill({contentType:'text/html',body:'<html><body><div id="x"></div></body></html>'}); });
 await pg.goto('http://t.local/p');
 await pg.addScriptTag({path:'/mnt/user-data/uploads/Northm/shared/flowEngine.js'});
 await pg.evaluate(([WRAP,PANEL])=>{
   window.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   window.SUPABASE_URL='http://t.local'; window.SUPABASE_ANON_KEY='anon'; window.FLU={sim:null};
   window.sb={auth:{getSession:async()=>({data:{session:{access_token:'tok123'}}})}}; window.currentWorkflow=()=>({name:'Onboarding'});
   window.__steps=[]; window.flCtx=()=>({});
   window.__realFE=window.FlowEngine;
   window.FlowEngine=Object.assign({},window.__realFE,{
     step:S=>{ const r=__steps.shift()||{actions:[]}; if(!__steps.length) S.done=true; return r; },
     run:S=>{ S.done=true; return [].concat(...__steps.splice(0).map(r=>r.actions)); } });
   (0,eval)(WRAP+'\n'+PANEL); },[WRAP,PANEL]);
 const mkS=()=>pg.evaluate(()=>{ window.__S={done:false,m:{name:'Acme',fields:{name:'Acme Pty'}},wfId:'w'}; FLU.sim=__S; });
 const act=(n,subj)=>({action:{type:'email',subject:subj,body:'Hello {{name}}'},nodeId:n});
 const html=()=>pg.evaluate(()=>{const d=document.createElement('div'); d.innerHTML=flSimTestPanelHtml(FLU.sim,{}); document.body.appendChild(d); window.__d=d; return d.innerText.replace(/\s+/g,' ');});
 // before running
 await pg.evaluate(()=>{FLU.sim=null}); let t=await html(); ok(/Simulate sends nothing/.test(t)&&!/Send test to me/.test(t),'before a run: explains, no button');
 // step capturing only email
 await mkS(); await pg.evaluate(()=>{ __steps.push({actions:[{action:{type:'note',message:'x'}}]},{actions:[{action:{type:'email',subject:'Welcome {{name}}',body:'Hello {{name}}'}}]},{actions:[]}); flSimStep(__S); flSimStep(__S); });
 t=await html(); ok(/Welcome Acme/.test(t)&&(t.match(/Send test to me/g)||[]).length===1,'Step: only the email step is listed, placeholders filled with the simulated record');
 ok(await pg.evaluate(()=>__S._acts.length)===2,'wrapper remembers every action reached');
 // run to end
 await mkS(); await pg.evaluate(()=>{ __steps.push({actions:[{action:{type:'email',subject:'A',body:'a'}}]},{actions:[{action:{type:'email',subject:'B',body:'b'}}]}); flSimRun(__S); });
 t=await html(); ok((t.match(/Send test to me/g)||[]).length===2,'Run to end: both email steps listed');
 // none reached
 await mkS(); await pg.evaluate(()=>{ __steps.push({actions:[{action:{type:'note'}}]}); flSimRun(__S); }); t=await html(); ok(/did not reach a Send email step/.test(t),'finished run without an email step says so');
 ok(true,'-');
 // send
 await mkS(); await pg.evaluate(()=>{ __steps.push({actions:[{action:{type:'email',subject:'Welcome {{name}}',body:'Hello {{name}}'}}]}); flSimRun(__S); document.body.innerHTML=flSimTestPanelHtml(FLU.sim,{}); });
 await pg.evaluate(()=>flSimSendTest(0)); await pg.waitForFunction(()=>/Sent to stef@example.com/.test(document.getElementById('flTestMsg').textContent));
 ok(calls.length===1&&calls[0].auth==='Bearer tok123'&&calls[0].body.subject==='Welcome Acme'&&calls[0].body.body==='Hello Acme'&&calls[0].body.flow==='Onboarding','sends the FILLED subject/body with the user\'s own token; no recipient field in the request: '+JSON.stringify(calls[0].body));
 ok(!('to' in calls[0].body)&&!('email' in calls[0].body),'request carries no recipient');
 ok(await pg.evaluate(()=>!document.getElementById('flTestBtn0').disabled),'button re-enabled after sending'); ok(await pg.evaluate(()=>document.getElementById('flTestBtn0').classList.contains('north-or')),'button has the North Orange class');
 mode='replay'; await pg.evaluate(()=>flSimSendTest(0)); await pg.waitForFunction(()=>/not sent twice/.test(document.getElementById('flTestMsg').textContent)); ok(true,'a repeat within the minute says it was not sent twice');
 mode='hubfail'; await pg.evaluate(()=>flSimSendTest(0)); await pg.waitForFunction(()=>/no email method connected/.test(document.getElementById('flTestMsg').textContent)); ok(await pg.evaluate(()=>document.getElementById('flTestMsg').style.color)==='var(--bad)','sending-account problem is shown in plain words (red)');
 mode='missing'; await pg.evaluate(()=>flSimSendTest(0)); await pg.waitForFunction(()=>/not installed yet/.test(document.getElementById('flTestMsg').textContent)); ok(true,'function not deployed: plain explanation, no crash');
 await pg.evaluate(()=>{ window.sb={auth:{getSession:async()=>({data:{session:null}})}}; }); mode='ok'; await pg.evaluate(()=>flSimSendTest(0)); await pg.waitForFunction(()=>/expired/.test(document.getElementById('flTestMsg').textContent)); ok(true,'no session: asks to sign in');
 await pg.evaluate(()=>{ window.sb={auth:{getSession:async()=>({data:{session:{access_token:'tok123'}}})}}; document.body.innerHTML=flSimTestPanelHtml(FLU.sim,{}); });
 mode='preflight'; await pg.evaluate(()=>flSimSendTest(0)); await pg.waitForFunction(()=>/not installed yet/.test(document.getElementById('flTestMsg').textContent)); ok(true,'POST blocked + GET 404 (not deployed): shows the not-installed message, not Failed to fetch');
 mode='preflight2'; await pg.evaluate(()=>flSimSendTest(0)); await pg.waitForFunction(()=>/Could not reach the test sender/.test(document.getElementById('flTestMsg').textContent)); ok(true,'POST blocked but function exists: generic reach message');
 ok(await pg.evaluate(()=>!/Failed to fetch/.test(document.getElementById('flTestMsg').textContent)),'raw Failed to fetch never shown');
 // escaping
 await pg.evaluate(()=>{ __steps.length=0; __S={done:true,m:{name:'x',fields:{}},wfId:'w',_acts:[{action:{type:'email',subject:'<img src=x onerror=window.__x=1>',body:''}}]}; FLU.sim=__S; document.body.innerHTML=flSimTestPanelHtml(FLU.sim,{}); });
 ok(await pg.evaluate(()=>!window.__x&&!document.querySelector('img')),'subject is escaped in the panel');
 ok(errs.length===0,'no page errors '+errs.join(';'));
 console.log(f?'FAILED '+f:'ALL PASS'); await b.close(); process.exit(f?1:0); })().catch(e=>{console.error(e);process.exit(2)});
