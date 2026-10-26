import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const source=fs.readFileSync(new URL('../web/cloud-boot.js',import.meta.url),'utf8');
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
function setup({fetch,hang=null,optional=false,error=null,asset='/evidence.js'}={}){
 const dom=new JSDOM('<body class="command-center-booting"><script type="text/plain" data-hosted-script '+(optional?'data-optional ':'')+'src="'+asset+'"></script><script type="text/plain" data-hosted-script src="/command-center.js"></script></body>',{url:'https://workspace.test',runScripts:'outside-only'});
 const w=dom.window,timers=new Map(),nodes=[],loaded=[];let id=0,installs=0,clock=0;
 w.setTimeout=(fn,delay)=>{timers.set(++id,{fn,delay,at:clock+delay});return id;};
 w.clearTimeout=key=>timers.delete(key);
 w.fetch=fetch|| (async url=>({ok:true,json:async()=>url==='/api/state'?{ok:true}:{files:{}}}));
 w.installHostedControls=()=>{installs++;w.document.body.classList.remove('command-center-booting');};
 const after=w.Element.prototype.after;
 w.Element.prototype.after=function(script){after.call(this,script);if(script.tagName!=='SCRIPT')return;
  nodes.push(script);const path=new URL(script.src).pathname;loaded.push(path);
  if(path===hang)return;
  queueMicrotask(()=>path===error?script.onerror?.():script.onload?.());
 };
 w.eval(source);
 return {dom,w,timers,nodes,loaded,get installs(){return installs;},
  async tick(ms){const target=clock+ms;await flush();
   for(;;){const entry=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;
    const [key,timer]=entry;clock=timer.at;timers.delete(key);timer.fn();await flush();}
   clock=target;await flush();},
  async expire(delay){await flush();const entries=[...timers].filter(([,timer])=>timer.delay===delay);
   assert.ok(entries.length,'expected a bounded pending operation');
   for(const [key,timer]of entries){timers.delete(key);timer.fn();}await flush();},
  close(){dom.window.close();}};
}

test('a hanging optional evidence script cannot block the core workspace',async()=>{
 const h=setup({hang:'/evidence.js',optional:true});try{
  await h.expire(3000);assert.equal(h.installs,1);assert.deepEqual(h.loaded,['/evidence.js','/command-center.js']);
  assert.equal(h.w.document.querySelector('.hosted-error'),null);assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('a hanging essential script reveals a bounded error and never installs controls',async()=>{
 const h=setup({hang:'/evidence.js'});try{
  await h.expire(10000);assert.equal(h.installs,0);assert.deepEqual(h.loaded,['/evidence.js']);
  assert.ok(h.w.document.querySelector('.hosted-error'));assert.equal(h.w.document.body.classList.contains('command-center-booting'),false);
  assert.equal(h.nodes[0].isConnected,false);assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('late optional load/error callbacks cannot install controls twice or alter an error',async()=>{
 const h=setup({hang:'/evidence.js',optional:true});try{
  await flush();const lateLoad=h.nodes[0].onload,lateError=h.nodes[0].onerror;
  await h.expire(3000);lateLoad?.();lateError?.();await flush();
  assert.equal(h.installs,1);assert.equal(h.w.document.querySelector('.hosted-error'),null);assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('an abort-ignoring state request is bounded without retry or login',async()=>{
 const calls=[];const h=setup({fetch:async url=>{calls.push(url);return url==='/api/state'?new Promise(()=>{}):{ok:true,json:async()=>({files:{}})};}});try{
  await h.expire(10000);assert.equal(h.installs,0);assert.deepEqual(calls,['/api/state','/api/progress']);
  assert.ok(h.w.document.querySelector('.hosted-error'));assert.equal(h.w.location.pathname,'/');assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('a hanging state JSON body is bounded and a late result cannot start scripts',async()=>{
 let finish;const h=setup({fetch:async url=>({ok:true,json:()=>url==='/api/state'?new Promise(resolve=>finish=resolve):Promise.resolve({files:{}})})});try{
  await h.expire(10000);finish({ok:true});await flush();assert.equal(h.installs,0);assert.deepEqual(h.loaded,[]);
  assert.ok(h.w.document.querySelector('.hosted-error'));assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('optional progress JSON failure does not block the existing workspace',async()=>{
 const h=setup({fetch:async url=>({ok:true,json:async()=>{if(url==='/api/progress')throw Error('private transport payload');return {ok:true};}})});try{
  await flush();assert.equal(h.installs,1);assert.equal(h.w.__outreachProgress,null);assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('an abort-ignoring optional progress request falls back once after its deadline',async()=>{
 const calls=[];const h=setup({fetch:async url=>{calls.push(url);return url==='/api/progress'?new Promise(()=>{}):{ok:true,json:async()=>({ok:true})};}});try{
  await h.expire(10000);assert.equal(h.installs,1);assert.equal(h.w.__outreachProgress,null);
  assert.deepEqual(calls,['/api/state','/api/progress']);assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('late essential-script events cannot hide the error or resume the core',async()=>{
 const h=setup({hang:'/evidence.js'});try{
  await flush();const lateLoad=h.nodes[0].onload,lateError=h.nodes[0].onerror;
  await h.expire(10000);lateLoad?.();lateError?.();await flush();
  assert.equal(h.installs,0);assert.deepEqual(h.loaded,['/evidence.js']);assert.ok(h.w.document.querySelector('.hosted-error'));
  assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('normal startup preserves ordered loading and successful desktop overrides',async()=>{
 const h=setup({fetch:async url=>({ok:true,json:async()=>url==='/api/state'?{ok:true}:url==='/api/progress'?{files:{'public/outreach_data.json':{source:'desktop'}}}:{ok:true,data:{rows:[]}}})});try{
  await flush();assert.equal(h.installs,1);assert.deepEqual(h.loaded,['/evidence.js','/command-center.js']);
  assert.equal(JSON.stringify(h.w.OUTREACH_SHEET_DATA),JSON.stringify({rows:[]}));
  assert.equal(h.w.document.querySelector('.hosted-error'),null);assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('a hanging desktop override JSON body fails explicitly without running old data',async()=>{
 const calls=[];const h=setup({fetch:async url=>{calls.push(url);return {ok:true,json:()=>url==='/api/state'?Promise.resolve({ok:true}):url==='/api/progress'?Promise.resolve({files:{'public/outreach_data.json':{source:'desktop'}}}):new Promise(()=>{})};}});try{
  await h.expire(20000);assert.equal(h.installs,0);assert.deepEqual(h.loaded,[]);assert.equal(calls.length,3);
  assert.ok(h.w.document.querySelector('.hosted-error'));assert.equal(h.timers.size,0);
 }finally{h.close();}
});
test('the displayed boot error never echoes arbitrary response data',async()=>{
 const h=setup({fetch:async url=>({ok:false,json:async()=>url==='/api/state'?{ok:false,error:'secret_transport_payload'}:{files:{}}})});try{
  await flush();assert.ok(h.w.document.querySelector('.hosted-error'));assert.doesNotMatch(h.w.document.querySelector('.hosted-error').textContent,/secret_transport_payload/);
  assert.equal(h.installs,0);assert.equal(h.timers.size,0);
 }finally{h.close();}
});

for(const file of ['autonomous-outreach-results.js','outreach-intelligence-latest.js']){
 test('large required '+file+' still loads promptly and only once',async()=>{
  const h=setup({asset:'/'+file+'?v=current'});try{
   await flush();assert.equal(h.installs,1);assert.deepEqual(h.loaded,['/'+file,'/command-center.js']);
   assert.equal(h.w.document.querySelector('.hosted-error'),null);assert.equal(h.timers.size,0);
  }finally{h.close();}
 });
 test('large required '+file+' may finish after 10s but before its 30s deadline',async()=>{
  const h=setup({asset:'/'+file+'?v=current',hang:'/'+file});try{
   await flush();const load=h.nodes[0].onload;
   await h.tick(10000);assert.equal(h.w.document.querySelector('.hosted-error'),null);assert.equal(h.installs,0);
   await h.tick(15000);load();await flush();
   assert.equal(h.installs,1);assert.deepEqual(h.loaded,['/'+file,'/command-center.js']);
   assert.equal(h.nodes.filter(node=>new URL(node.src).pathname==='/'+file).length,1);
   assert.equal(h.w.document.querySelector('.hosted-error'),null);assert.equal(h.timers.size,0);
  }finally{h.close();}
 });
 test('large required '+file+' fails at 30s with safe diagnostics and cannot resume late',async()=>{
  const h=setup({asset:'/'+file+'?customer=private_customer&token=private_token',hang:'/'+file});try{
   await flush();const load=h.nodes[0].onload,error=h.nodes[0].onerror;
   await h.tick(29999);assert.equal(h.w.document.querySelector('.hosted-error'),null);
   await h.tick(1);const panel=h.w.document.querySelector('.hosted-error');assert.ok(panel);
   assert.equal(h.w.__outreachBootFailure.asset,file);assert.equal(h.w.__outreachBootFailure.deadlineMs,30000);
   assert.match(panel.textContent,new RegExp(file.replaceAll('.','\\.')));assert.match(panel.textContent,/30/);
   assert.doesNotMatch(panel.textContent+JSON.stringify(h.w.__outreachBootFailure),/private_customer|private_token|[?&]/);
   load();error();await flush();assert.equal(h.installs,0);assert.deepEqual(h.loaded,['/'+file]);
   assert.equal(h.w.document.querySelector('.hosted-error'),panel);assert.equal(h.nodes[0].isConnected,false);assert.equal(h.timers.size,0);
  }finally{h.close();}
 });
}
test('a large permanent ledger cannot become optional through a data attribute',async()=>{
 const file='/autonomous-outreach-results.js';const h=setup({asset:file,hang:file,optional:true});try{
  await h.tick(3000);assert.equal(h.installs,0);assert.equal(h.w.document.querySelector('.hosted-error'),null);
  await h.tick(7000);assert.equal(h.w.document.querySelector('.hosted-error'),null);
  await h.tick(20000);assert.ok(h.w.document.querySelector('.hosted-error'));assert.equal(h.installs,0);
  assert.deepEqual(h.loaded,[file]);assert.equal(h.w.__outreachBootWarnings,undefined);assert.equal(h.timers.size,0);
 }finally{h.close();}
});
