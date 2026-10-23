import runTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../web/login.js',import.meta.url),'utf8');
const test=(name,fn)=>runTest(name,{timeout:1000},fn);
const origin='https://flextail-customer-workspace.leo13111.chatgpt.site';
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function settle(){for(let n=0;n<16;n++)await Promise.resolve();}
function fixture(fetcher,{search='',password='fixture-secret-not-for-output'}={}){
 let handler,now=0,sequence=0;
 const timers=new Map(),calls=[],navigations=[],button={disabled:false},error={textContent:''};
 const input={value:password},form={addEventListener:(name,fn)=>{assert.equal(name,'submit');handler=fn;}};
 const document={querySelector:selector=>{
  if(selector==='#access-form')return form;
  if(selector==='#access-password')return input;
  if(selector==='#access-error')return error;
  throw Error('Unexpected DOM read');
 }};
 const location={origin,href:origin+'/login'+search,search,assign:path=>navigations.push(path)};
 const neverStore={getItem:()=>assert.fail('No credential storage reads'),setItem:()=>assert.fail('No credential storage writes')};
 const context={document,location,URL,URLSearchParams,AbortController,
  localStorage:neverStore,sessionStorage:neverStore,
  console:{log:()=>assert.fail('No credential logs'),error:()=>assert.fail('No credential logs')},
  fetch:(url,options={})=>{calls.push({url,options});return fetcher(url,options,calls.length);},
  setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:now+delay});return id;},
  clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,context,{filename:'web/login.js'});
 const submit=()=>handler({preventDefault(){},target:{querySelector:selector=>{assert.equal(selector,'button');return button;}}});
 const tick=async ms=>{
  const until=now+ms;
  for(;;){
   await settle();
   const due=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
   if(!due)break;
   now=due[1].at;timers.delete(due[0]);due[1].fn();
  }
  now=until;await settle();
 };
 return {submit,tick,calls,navigations,button,error,input,timers};
}
const methods=f=>f.calls.map(call=>call.options.method||'GET');

test('successful access request navigates once and clears its deadline',async()=>{
 const f=fixture(async()=>response({ok:true}),{search:'?returnTo=%2F%3Fview%3Dcustomers'});
 await f.submit();
 assert.deepEqual(methods(f),['POST']);
 assert.deepEqual(f.navigations,['/?view=customers']);
 assert.equal(f.button.disabled,false);assert.equal(f.timers.size,0);
 assert.equal(f.input.value,'fixture-secret-not-for-output');
});

test('wrong password remains an explicit failure without a recovery POST or GET',async()=>{
 const f=fixture(async()=>response({ok:false,error:'访问密码不正确'},401));
 await f.submit();
 assert.deepEqual(methods(f),['POST']);assert.deepEqual(f.navigations,[]);
 assert.match(f.error.textContent,/访问密码不正确/);assert.equal(f.button.disabled,false);
});

test('HTTP 429 stays an explicit rate-limit failure with no automatic retry',async()=>{
 const f=fixture(async()=>response({ok:false,error:'请一分钟后重试'},429));
 await f.submit();assert.deepEqual(methods(f),['POST']);assert.deepEqual(f.navigations,[]);
 assert.match(f.error.textContent,/一分钟后重试/);assert.equal(f.button.disabled,false);
});

test('HTTP success with an unsuccessful access body cannot navigate',async()=>{
 const f=fixture(async()=>response({ok:false,error:'未完成'}));
 await f.submit();assert.deepEqual(f.navigations,[]);assert.deepEqual(methods(f),['POST']);
 assert.notEqual(f.error.textContent,'');assert.equal(f.button.disabled,false);
});

test('a network failure makes only one read-only session request',async()=>{
 const f=fixture(async(_url,options)=>{if(options.method==='POST')throw Error('network failed');return response({ok:true,authenticated:false});});
 await f.submit();
 assert.deepEqual(methods(f),['POST','GET']);assert.deepEqual(f.navigations,[]);
 assert.match(f.error.textContent,/未确认|待核实/);assert.equal(f.button.disabled,false);
 const check=f.calls[1];assert.equal(check.url,'/api/access');assert.equal(check.options.body,undefined);
 assert.equal(check.options.cache,'no-store');assert.equal(check.options.credentials,'same-origin');
});

test('hard deadline releases an abort-ignoring POST and verifies an existing session',async()=>{
 const f=fixture((_url,options)=>options.method==='POST'?new Promise(()=>{}):Promise.resolve(response({ok:true,authenticated:true})));
 void f.submit();await settle();assert.equal(f.button.disabled,true);
 await f.tick(10000);
 assert.deepEqual(methods(f),['POST','GET']);assert.equal(f.calls[0].options.signal.aborted,true);
 assert.deepEqual(f.navigations,['/?view=agent']);assert.equal(f.button.disabled,false);
 assert.equal(f.timers.size,0);
});

test('a timed-out POST with an unauthenticated read stays unknown and never retries',async()=>{
 const f=fixture((_url,options)=>options.method==='POST'?new Promise(()=>{}):Promise.resolve(response({ok:true,authenticated:false})));
 void f.submit();await f.tick(10000);
 assert.deepEqual(methods(f),['POST','GET']);assert.deepEqual(f.navigations,[]);
 assert.match(f.error.textContent,/未确认|待核实/);assert.doesNotMatch(f.error.textContent,/密码不正确/);
 assert.equal(f.button.disabled,false);assert.equal(f.timers.size,0);
});

test('the same hard deadline covers a hanging POST JSON body',async()=>{
 const f=fixture((_url,options)=>options.method==='POST'?Promise.resolve({ok:true,status:200,json:()=>new Promise(()=>{})}):Promise.resolve(response({ok:true,authenticated:true})));
 void f.submit();await f.tick(10000);
 assert.deepEqual(methods(f),['POST','GET']);assert.deepEqual(f.navigations,['/?view=agent']);
 assert.equal(f.calls[0].options.signal.aborted,true);assert.equal(f.button.disabled,false);
});

test('invalid POST JSON checks the session once instead of repeating the password',async()=>{
 const f=fixture(async(_url,options)=>options.method==='POST'?{ok:true,status:200,json:async()=>{throw Error('invalid JSON');}}:response({ok:true,authenticated:true}));
 await f.submit();assert.deepEqual(methods(f),['POST','GET']);
 assert.deepEqual(f.navigations,['/?view=agent']);assert.equal(f.button.disabled,false);
});

test('invalid read-only JSON leaves authentication unknown and the form usable',async()=>{
 const f=fixture(async(_url,options)=>{if(options.method==='POST')throw Error('network');return {ok:true,status:200,json:async()=>{throw Error('invalid JSON');}};});
 await f.submit();assert.deepEqual(methods(f),['POST','GET']);assert.deepEqual(f.navigations,[]);
 assert.match(f.error.textContent,/未确认|待核实/);assert.equal(f.button.disabled,false);
});

test('the single read-only GET has its own deadline when fetch never settles',async()=>{
 const f=fixture(async(_url,options)=>{if(options.method==='POST')throw Error('connection lost');return new Promise(()=>{});});
 void f.submit();await settle();assert.deepEqual(methods(f),['POST','GET']);
 await f.tick(10000);
 assert.equal(f.button.disabled,false);assert.equal(f.calls[1].options.signal.aborted,true);
 assert.deepEqual(f.navigations,[]);assert.match(f.error.textContent,/未确认|待核实/);
 assert.equal(f.timers.size,0);
});

test('the single read-only GET deadline also covers its JSON body',async()=>{
 const f=fixture(async(_url,options)=>{if(options.method==='POST')throw Error('connection lost');return {ok:true,status:200,json:()=>new Promise(()=>{})};});
 void f.submit();await f.tick(10000);
 assert.deepEqual(methods(f),['POST','GET']);assert.deepEqual(f.navigations,[]);
 assert.equal(f.button.disabled,false);assert.equal(f.calls[1].options.signal.aborted,true);
 assert.equal(f.timers.size,0);
});

test('both hanging phases stay bounded without treating a request deadline as cancellation proof',async()=>{
 const f=fixture(()=>new Promise(()=>{}));
 void f.submit();await f.tick(10000);assert.equal(f.button.disabled,true);
 await f.tick(10000);
 assert.deepEqual(methods(f),['POST','GET']);assert.equal(f.button.disabled,false);
 assert.deepEqual(f.navigations,[]);assert.equal(f.timers.size,0);
});

test('double submission cannot overlap the initial password POST',async()=>{
 const post=gate();const f=fixture(()=>post.promise);
 const first=f.submit();await settle();void f.submit();await settle();
 assert.deepEqual(methods(f),['POST']);assert.equal(f.button.disabled,true);
 post.resolve(response({ok:true}));await first;
 assert.deepEqual(f.navigations,['/?view=agent']);assert.equal(f.button.disabled,false);
});

test('the pending mutex also protects the read-only recovery phase',async()=>{
 const read=gate();const f=fixture(async(_url,options)=>{if(options.method==='POST')throw Error('network');return read.promise;});
 const first=f.submit();await settle();await f.submit();
 assert.deepEqual(methods(f),['POST','GET']);assert.equal(f.button.disabled,true);
 read.resolve(response({ok:true,authenticated:false}));await first;
 assert.deepEqual(f.navigations,[]);assert.equal(f.button.disabled,false);
});

test('late POST success after timeout cannot navigate or change the unknown result',async()=>{
 const post=gate();const f=fixture((_url,options)=>options.method==='POST'?post.promise:Promise.resolve(response({ok:true,authenticated:false})));
 void f.submit();await f.tick(10000);const text=f.error.textContent;
 post.resolve(response({ok:true}));await settle();
 assert.deepEqual(f.navigations,[]);assert.equal(f.error.textContent,text);
 assert.deepEqual(methods(f),['POST','GET']);assert.equal(f.button.disabled,false);
});

test('late read-only authentication after its deadline is ignored',async()=>{
 const read=gate();const f=fixture(async(_url,options)=>{if(options.method==='POST')throw Error('network');return read.promise;});
 void f.submit();await f.tick(10000);const text=f.error.textContent;
 read.resolve(response({ok:true,authenticated:true}));await settle();
 assert.deepEqual(f.navigations,[]);assert.equal(f.error.textContent,text);
 assert.equal(f.button.disabled,false);assert.deepEqual(methods(f),['POST','GET']);
});

test('only a new explicit submit may retry after an unknown result',async()=>{
 const firstPost=gate();let posts=0;
 const f=fixture((_url,options)=>{
  if(options.method==='POST')return ++posts===1?firstPost.promise:Promise.resolve(response({ok:true}));
  return Promise.resolve(response({ok:true,authenticated:false}));
 });
 void f.submit();await f.tick(10000);assert.deepEqual(methods(f),['POST','GET']);
 await f.submit();assert.deepEqual(methods(f),['POST','GET','POST']);
 assert.deepEqual(f.navigations,['/?view=agent']);
 firstPost.resolve(response({ok:true}));await settle();assert.equal(f.navigations.length,1);
});

test('read-only failure or malformed auth data cannot claim successful authentication',async()=>{
 for(const readResponse of [response({ok:false,authenticated:true},503),response({ok:false,authenticated:true}),response({ok:true,authenticated:'true'}),response({ok:true})]){
  const f=fixture(async(_url,options)=>{if(options.method==='POST')throw Error('network');return readResponse;});
  await f.submit();assert.deepEqual(f.navigations,[]);assert.equal(f.button.disabled,false);
  assert.deepEqual(methods(f),['POST','GET']);
 }
});

test('returnTo permits local paths but rejects external, backslash and control-character redirects',async()=>{
 for(const [path,expected] of [
  ['/?view=customers&search=Test','/?view=customers&search=Test'],
  ['/materials#catalog','/materials#catalog'],
  ['https://attacker.invalid/path','/?view=agent'],
  ['//attacker.invalid/path','/?view=agent'],
  ['/\\attacker.invalid/path','/?view=agent'],
  ['/\n/attacker.invalid/path','/?view=agent'],
  ['javascript:alert(1)','/?view=agent']
 ]){
  const f=fixture(async()=>response({ok:true}),{search:'?returnTo='+encodeURIComponent(path)});
  await f.submit();assert.deepEqual(f.navigations,[expected],path);
 }
});

test('failure UI never echoes a password or raw transport/server diagnostic',async()=>{
 const password='fixture-private-credential';
 for(const failure of ['transport','response']){
  const f=fixture(async(_url,options)=>{
   if(options.method==='GET')return response({ok:true,authenticated:false});
   if(failure==='transport')throw Error('network '+password);
   return response({ok:false,error:password},401);
  },{password});
  await f.submit();assert.doesNotMatch(f.error.textContent,new RegExp(password));
  assert.equal(f.input.value,password);assert.equal(f.timers.size,0);
 }
});
