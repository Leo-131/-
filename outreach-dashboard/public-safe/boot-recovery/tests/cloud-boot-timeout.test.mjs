import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const source=fs.readFileSync(new URL('../web/cloud-boot.js',import.meta.url),'utf8');
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
function setup({fetch,hang=null,optional=false,error=null}={}){
 const dom=new JSDOM('<body class="command-center-booting"><script type="text/plain" data-hosted-script '+(optional?'data-optional ':'')+'src="/evidence.js"></script><script type="text/plain" data-hosted-script src="/command-center.js"></script></body>',{url:'https://workspace.test',runScripts:'outside-only'});
 const w=dom.window,timers=new Map(),nodes=[],loaded=[];let id=0,installs=0;
 w.setTimeout=(fn,delay)=>{timers.set(++id,{fn,delay});return id;};
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
