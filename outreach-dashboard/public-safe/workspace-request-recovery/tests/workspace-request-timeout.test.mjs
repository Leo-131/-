import runTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../web/workspace-premium.js',import.meta.url),'utf8');
const historySource=fs.readFileSync(new URL('../web/task-delivery-history.js',import.meta.url),'utf8');
const test=(name,fn)=>runTest(name,{timeout:1000},fn);
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const empty=()=>response({ok:true,tasks:[],bridge:{deliveries:{}}});
const task=()=>response({ok:true,task:{id:'synthetic-task',status:'queued'}});
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function settle(){for(let n=0;n<32;n++)await Promise.resolve();}

// Deterministic browser-shaped fixtures only: no network, credentials, real
// task records, browser control, timers or file writes leave this VM.
function fixture(fetcher=()=>empty()){
 let now=0,sequence=0,uuids=0;
 const calls=[],timers=new Map(),tools=new Map(),listeners={};
 const element=(value='')=>({value,textContent:'',innerHTML:'',disabled:false,dataset:{}});
 const elements={
  'goal-text':element('Synthetic customer research only'),
  'goal-market':element('Singapore'),
  'goal-count':element('1'),
  'goal-kind':element('research'),
  'goal-send-consent':{checked:false},
  'goal-status':element(),
  'goal-history':element(),
  'goal-history-count':element(),
  'goal-refresh':element(),
  'bridge-check':element(),
  'bridge-check-status':element()
 };
 const button=element();
 elements['development-goal-form']={dataset:{},reportValidity:()=>true,
  addEventListener:(event,handler)=>{listeners[event]=handler;},
  querySelector:selector=>{assert.equal(selector,'button[type=submit]');return button;}};
 const context={URL,AbortController,
  location:{href:'https://workspace.test/?view=workspace'},
  localStorage:{getItem:()=>null,setItem:()=>{}},
  crypto:{randomUUID:()=>`synthetic-request-${++uuids}`},
  MutationObserver:class{observe(){}},
  document:{body:{},getElementById:id=>elements[id]??null,querySelector:()=>null,
   modelContext:{registerTool:tool=>{tools.set(tool.name,tool);}}},
  fetch:(url,options={})=>{calls.push({url,options});return fetcher(url,options,calls.length);},
  setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:now+delay});return id;},
  clearTimeout:id=>timers.delete(id)
 };
 context.window=context;
 vm.runInNewContext(historySource,context,{filename:'web/task-delivery-history.js'});
 vm.runInNewContext(source,context,{filename:'web/workspace-premium.js'});
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
 return{calls,elements,button,timers,tools,tick,ready:settle,
  submit:()=>elements['development-goal-form'].onsubmit({preventDefault(){}}),
  refresh:()=>elements['goal-refresh'].onclick(),bridge:()=>elements['bridge-check'].onclick(),
  input:()=>listeners.input?.(),
  cancel:id=>elements['goal-history'].onclick({target:{dataset:{cancelGoal:id}}})};
}
const writes=f=>f.calls.filter(c=>['POST','PATCH'].includes(c.options.method));
const methods=f=>f.calls.map(c=>c.options.method||'GET');

for(const phase of ['fetch','json'])test(`initial task GET ${phase} has a hard deadline even when abort is ignored`,async()=>{
 const f=fixture(()=>phase==='fetch'?new Promise(()=>{}):{ok:true,status:200,json:()=>new Promise(()=>{})});
 await f.ready();await f.tick(9999);assert.equal(f.elements['goal-history'].textContent,'');
 await f.tick(1);
 assert.match(f.elements['goal-history'].textContent,/超时|未确认|待核实/);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.signal.aborted,true);assert.equal(f.timers.size,0);
 await f.tick(60000);assert.equal(f.calls.length,1,'no automatic read loop');
});

test('successful task submit clears deadlines, retains inputs and ignores a concurrent submit',async()=>{
 const post=gate();const f=fixture((_url,options)=>options.method==='POST'?post.promise:empty());
 await f.ready();const pending=f.submit();await settle();await f.submit();
 assert.equal(writes(f).length,1);assert.equal(f.button.disabled,true);
 post.resolve(task());await pending;await settle();
 assert.equal(f.button.disabled,false);assert.equal(f.timers.size,0);
 assert.match(f.elements['goal-status'].textContent,/任务已保存/);
 assert.equal(f.elements['goal-text'].value,'Synthetic customer research only');
});

for(const phase of ['fetch','json'])test(`task POST ${phase} deadline releases controls without re-posting`,async()=>{
 const post=gate();const f=fixture((_url,options)=>options.method==='POST'?
  (phase==='fetch'?post.promise:{ok:true,status:200,json:()=>post.promise}):empty());
 await f.ready();const pending=f.submit();await settle();await f.tick(10000);
 assert.equal(f.button.disabled,false);assert.equal(writes(f).length,1);
 assert.equal(writes(f)[0].options.signal.aborted,true);assert.equal(f.timers.size,0);
 assert.match(f.elements['goal-status'].textContent,/未确认|待核实/);
 assert.match(f.elements['goal-status'].textContent,/刷新|核实/);
 assert.equal(f.elements['goal-text'].value,'Synthetic customer research only');
 await pending;const text=f.elements['goal-status'].textContent;
 await f.tick(60000);assert.equal(writes(f).length,1);
 post.resolve(phase==='fetch'?task():{ok:true,task:{status:'queued'}});await settle();
 assert.equal(f.elements['goal-status'].textContent,text,'late success cannot replace unknown outcome');
 assert.equal(f.button.disabled,false);assert.equal(writes(f).length,1);
});

test('unknown POST retains its ID across unchanged input events and changed-then-restored values',async()=>{
 const first=gate();let posts=0;
 const f=fixture((_url,options)=>options.method==='POST'?(++posts===1?first.promise:task()):empty());
 await f.ready();void f.submit();await f.tick(10000);assert.equal(f.button.disabled,false);
 const original=JSON.parse(writes(f)[0].options.body),value=f.elements['goal-text'].value;
 f.input();f.elements['goal-text'].value='Temporary unsent edit';f.input();
 f.elements['goal-text'].value=value;f.input();await f.submit();await settle();
 const retried=JSON.parse(writes(f)[1].options.body);assert.equal(retried.id,original.id);
 f.elements['goal-text'].value='A genuinely different synthetic goal';await f.submit();await settle();
 const changed=JSON.parse(writes(f)[2].options.body);assert.notEqual(changed.id,original.id);
 const after=f.elements['goal-status'].textContent;first.resolve(task());await settle();
 assert.equal(f.elements['goal-status'].textContent,after);assert.equal(writes(f).length,3);
 assert.equal(f.timers.size,0);
});

test('network or malformed-body write failures remain unknown with no automatic retry',async()=>{
 for(const mode of ['network','json']){
  const f=fixture((_url,options)=>{
   if(options.method!=='POST')return empty();
   if(mode==='network')throw Error('synthetic transport failure');
   return{ok:true,status:200,json:async()=>{throw Error('synthetic malformed body');}};
  });
  await f.ready();await f.submit();await settle();
  assert.equal(f.button.disabled,false);assert.equal(writes(f).length,1);assert.equal(f.timers.size,0);
  assert.match(f.elements['goal-status'].textContent,/未确认|待核实/);
  await f.tick(60000);assert.equal(writes(f).length,1);
 }
});

test('HTTP authentication and rate-limit denials remain explicit without retry or browser actions',async()=>{
 for(const status of [401,403,429]){
  const f=fixture((_url,options)=>options.method==='POST'?response({ok:false,error:'Synthetic explicit denial'},status):empty());
  await f.ready();await f.submit();await settle();
  assert.match(f.elements['goal-status'].textContent,/Synthetic explicit denial/);
  assert.equal(f.button.disabled,false);assert.equal(writes(f).length,1);assert.equal(f.timers.size,0);
  await f.tick(60000);assert.equal(writes(f).length,1);
 }
});

for(const phase of ['fetch','json'])test(`bridge ${phase} deadline is bounded and double-check cannot duplicate POST`,async()=>{
 const pending=gate();const f=fixture(url=>url==='/api/ai-company-bridge'?
  (phase==='fetch'?pending.promise:{ok:true,status:200,json:()=>pending.promise}):empty());
 await f.ready();const first=f.bridge();await settle();void f.bridge();await settle();
 assert.equal(writes(f).length,1);await f.tick(10000);
 assert.equal(f.elements['bridge-check'].disabled,false);assert.equal(f.timers.size,0);
 assert.match(f.elements['bridge-check-status'].textContent,/未确认|待核实/);await first;
 const text=f.elements['bridge-check-status'].textContent;
 pending.resolve(phase==='fetch'?response({status:'received',executionConnected:true}):{status:'received',executionConnected:true});
 await settle();assert.equal(f.elements['bridge-check-status'].textContent,text);
 await f.tick(60000);assert.equal(writes(f).length,1);
});

test('a newer task refresh cannot be overwritten by an older response',async()=>{
 const old=gate(),fresh=gate();let reads=0;
 const f=fixture(()=>++reads===1?old.promise:fresh.promise);await f.ready();const pending=f.refresh();await settle();
 fresh.resolve(empty());await pending;const text=f.elements['goal-history'].innerHTML;
 old.resolve(response({ok:true,tasks:[{id:'old-task',request:{goal:'Obsolete synthetic goal',market:'SG',target:1},
  status:'queued',completedCount:0,summary:'old',history:[]}],bridge:{deliveries:{}}}));await settle();
 assert.equal(f.elements['goal-history'].innerHTML,text);assert.equal(f.timers.size,0);
});

test('late task GET body completion cannot overwrite a deadline message',async()=>{
 const body=gate();const f=fixture(()=>({ok:true,status:200,json:()=>body.promise}));
 await f.tick(10000);assert.match(f.elements['goal-history'].textContent,/超时|未确认|待核实/);
 const text=f.elements['goal-history'].textContent;body.resolve({ok:true,tasks:[]});await settle();
 assert.equal(f.elements['goal-history'].textContent,text);assert.equal(f.calls.length,1);
});

test('a t9 task refresh returning an old probe at t11 cannot erase the t10 explicit bridge unknown',async()=>{
 for(const reverse of [false,true]){
  const post=gate(),older=gate(),newer=gate();let reads=0;
  const f=fixture(url=>url==='/api/ai-company-bridge'?post.promise:
   (++reads===1?empty():reads===2?older.promise:newer.promise));
  await f.ready();const bridge=f.bridge();await f.tick(9000);
  const first=f.refresh();await settle();let second;
  if(reverse){await f.tick(100);second=f.refresh();await settle();await f.tick(900);}else await f.tick(1000);
  await bridge;const text=f.elements['bridge-check-status'].textContent;assert.match(text,/未确认|待核实/);
  await f.tick(1000);
  const oldProbe={status:'received',executionConnected:false,checkedAt:'2026-10-01T00:00:00Z',diagnostic:'obsolete probe'};
  if(reverse){newer.resolve(response({ok:true,tasks:[],bridge:{deliveries:{__probe:{...oldProbe,
   checkedAt:'2026-10-02T00:00:00Z'}}}}));await second;}
  older.resolve(response({ok:true,tasks:[],bridge:{deliveries:{__probe:oldProbe}}}));await first;await settle();
  assert.equal(f.elements['bridge-check-status'].textContent,text,'task refresh must not replace current explicit unknown');
  assert.equal(writes(f).length,1);assert.equal(f.elements['bridge-check'].disabled,false);assert.equal(f.timers.size,0);
 }
});

test('explicit bridge success owns its display while a later explicit check can update it',async()=>{
 let checks=0;
 const f=fixture(url=>{
  if(url==='/api/ai-company-bridge')return response({status:'received',executionConnected:++checks===1,
   diagnostic:checks===1?'current explicit success':'new explicit result'});
  return response({ok:true,tasks:[],bridge:{deliveries:{__probe:{status:'received',executionConnected:false,
   checkedAt:'2026-10-01T00:00:00Z',diagnostic:'obsolete historical probe'}}}});
 });
 await f.ready();assert.match(f.elements['bridge-check-status'].textContent,/obsolete historical probe/);
 await f.bridge();await settle();assert.match(f.elements['bridge-check-status'].textContent,/current explicit success/);
 assert.doesNotMatch(f.elements['bridge-check-status'].textContent,/obsolete historical probe/);
 await f.bridge();await settle();assert.match(f.elements['bridge-check-status'].textContent,/new explicit result/);
 assert.equal(writes(f).length,2,'only two explicit bridge clicks may issue POSTs');assert.equal(f.timers.size,0);
});

test('a task refresh cannot overwrite an in-flight explicit bridge status',async()=>{
 const post=gate();
 const f=fixture(url=>url==='/api/ai-company-bridge'?post.promise:response({ok:true,tasks:[],bridge:{deliveries:{
  __probe:{status:'received',executionConnected:false,checkedAt:'2026-10-01T00:00:00Z',diagnostic:'old probe'}}}}));
 await f.ready();const pending=f.bridge();await settle();const text=f.elements['bridge-check-status'].textContent;
 assert.match(text,/正在核验/);await f.refresh();assert.equal(f.elements['bridge-check-status'].textContent,text);
 await f.tick(10000);await pending;assert.match(f.elements['bridge-check-status'].textContent,/未确认|待核实/);
 assert.equal(writes(f).length,1);assert.equal(f.timers.size,0);
});

for(const name of ['read_development_tasks','accept_development_task','record_development_result'])
 test(`WebMCP ${name} shares the hard request deadline and never auto-retries`,async()=>{
  let initial=true;
  const f=fixture(()=>{if(initial){initial=false;return empty();}return new Promise(()=>{});});
  await f.ready();const tool=f.tools.get(name);assert.ok(tool);
  let error;const pending=tool.execute({id:'synthetic-task',executor:'synthetic-controller',status:'running',
   summary:'Synthetic only',completedCount:0,evidence:[]}).catch(value=>{error=value;});
  await settle();await f.tick(10000);assert.ok(error,'caller must be released at deadline');
  assert.match(error.message,/超时|未确认|待核实/);await pending;
  assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);
  await f.tick(60000);assert.equal(f.calls.length,2);
 });

test('cancel PATCH uses the deadline helper and never retries an unknown mutation',async()=>{
 const f=fixture((_url,options)=>options.method==='PATCH'?new Promise(()=>{}):empty());
 await f.ready();const pending=f.cancel('synthetic-task');await f.tick(10000);
 assert.match(f.elements['goal-status'].textContent,/未确认|待核实/);await pending;
 assert.equal(writes(f).length,1);assert.equal(writes(f)[0].options.method,'PATCH');assert.equal(f.timers.size,0);
});

test('confirmed POST and WebMCP PATCH return before an unrelated history refresh stalls',async()=>{
 let reads=0;
 const f=fixture((_url,options)=>{
  if(options.method==='POST'||options.method==='PATCH')return task();
  return ++reads===1?empty():new Promise(()=>{});
 });
 await f.ready();void f.submit();await settle();
 assert.equal(f.button.disabled,false,'a committed task must not hold its button for a separate GET');
 let result;void f.tools.get('accept_development_task').execute({id:'synthetic-task',executor:'synthetic-controller'})
  .then(value=>{result=value;});await settle();assert.equal(result?.task?.status,'queued');
 await f.tick(10000);assert.equal(f.timers.size,0);assert.equal(writes(f).length,2);
});
