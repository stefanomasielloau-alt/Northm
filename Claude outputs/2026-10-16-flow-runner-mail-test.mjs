const m = await import(process.argv[2]);
let f=0; const ok=(c,t)=>{ console.log((c?'pass ':'FAIL ')+t); if(!c) f++; };
function fakeDb(settings, secret){ return { from:(t)=>({ select:()=>({ eq:()=>({ eq:()=>({ eq:()=>({ maybeSingle: async()=>({ data: t==='message_channel_settings'?settings:(secret?{secret}:null) }) }) , maybeSingle: async()=>({ data: t==='message_channel_settings'?settings:(secret?{secret}:null) }) }) }) }) }) }; }
const run={id:'run1'}, o={id:'org1'}, cfg={to:[{email:'a@x.com',name:'A'},{email:'b@x.com',name:'B'}],subject:'Hello',body:'Body'};
// 1. channel on -> provider called once per recipient, no Hub
let calls=[], hub=0; const stats={dispatched:0};
let send=m.makeMailer({ db:fakeDb({enabled:true,provider:'resend',config:{from:'North <n@acme.com>'}},'KEY'), fetch:async(u,opt)=>{ calls.push({u,opt}); return {ok:true,status:200,text:async()=>'{}'}; }, stats, dispatch:async()=>{hub++; return {ok:true};} });
let r=await send(o,run,'n1',1,null,cfg);
ok(r.ok && calls.length===2 && hub===0 && /North email channel/.test(r.result.detail),'channel on: emailed each recipient directly, not via Hub');
ok(calls[0].u==='https://api.resend.com/emails' && JSON.parse(calls[0].opt.body).to[0]==='a@x.com' && calls[0].opt.headers['Idempotency-Key']==='run1:n1:1:a@x.com','resend request + per-recipient idempotency key');
// 2. channel off -> Hub dispatch
calls=[]; hub=0; send=m.makeMailer({ db:fakeDb({enabled:false,provider:'resend',config:{from:'n@acme.com'}},'KEY'), fetch:async()=>{calls.push(1);return {ok:true}}, stats, dispatch:async(o2,r2,n2,a2,rec,act)=>{hub++; return {ok:true, act};} });
r=await send(o,run,'n1',1,null,cfg); ok(hub===1 && calls.length===0 && r.act.type==='email' && r.act.config.to.length===2,'channel off: falls back to Hub dispatch unchanged');
// 3. no secret -> Hub
hub=0; send=m.makeMailer({ db:fakeDb({enabled:true,provider:'resend',config:{from:'n@acme.com'}},null), fetch:async()=>({ok:true}), stats, dispatch:async()=>{hub++;return {ok:true}} });
await send(o,run,'n1',1,null,cfg); ok(hub===1,'no API key saved: Hub');
// 4. provider error -> key scrubbed, retryable on 5xx
send=m.makeMailer({ db:fakeDb({enabled:true,provider:'resend',config:{from:'n@acme.com'}},'SECRETKEY'), fetch:async()=>({ok:false,status:503,text:async()=>'bad SECRETKEY'}), stats, dispatch:async()=>({ok:true}) });
r=await send(o,run,'n1',1,null,cfg); ok(!r.ok && r.retryable && !/SECRETKEY/.test(r.error) && /503/.test(r.error),'provider 503: retryable, key scrubbed');
send=m.makeMailer({ db:fakeDb({enabled:true,provider:'resend',config:{from:'n@acme.com'}},'K'), fetch:async()=>({ok:false,status:422,text:async()=>'domain not verified'}), stats, dispatch:async()=>({ok:true}) });
r=await send(o,run,'n1',1,null,cfg); ok(!r.ok && !r.retryable,'provider 422: not retried');
// 5. subject injection + bad from
ok(m.mailParseFrom('X <a@b.co>\r\nBcc: z@z.com')===null && m.mailParseFrom('bad')===null,'bad From refused');
ok(!/\n/.test(m.mailRequest({provider:'postmark',key:'k',from:m.mailParseFrom('a@b.co')},'c@d.co','Hi\r\nBcc: x','t','i').body.Subject),'subject line breaks stripped');
console.log(f?'FAILED '+f:'ALL PASS'); process.exit(f?1:0);
