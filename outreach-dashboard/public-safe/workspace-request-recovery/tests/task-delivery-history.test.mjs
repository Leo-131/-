import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const context={window:{fetch:async()=>{}},document:{getElementById(){return null;},querySelector(){return null;},body:{}},localStorage:{getItem(){return null;}},MutationObserver:class{observe(){}},location:{href:'https://workspace.test/'},URL};
vm.runInNewContext(fs.readFileSync(new URL('../web/task-delivery-history.js',import.meta.url),'utf8'),context);
vm.runInNewContext(fs.readFileSync(new URL('../web/workspace-premium.js',import.meta.url),'utf8'),context);
const api=context.window.TaskDeliveryHistory;
test('delivery history is default-collapsed with native keyboard-accessible summary',()=>{
 const html=context.window.renderDevelopmentGoal();assert.match(html,/<details class="goal-history-fold" id="goal-history-fold">/);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);assert.match(html,/展开查看任务与时间线/);assert.match(html,/检查桥接（不发信）/);
});
test('history and bridge receipts are ordered; missing dates remain unknown and old checkpoints are not fabricated',()=>{
 const t={createdAt:'2026-10-15T02:00:00Z',startedAt:'2026-10-15T02:05:00Z',updatedAt:'2026-10-15T02:10:00Z',summary:'旧结果'};
 assert.equal(api.timeline(t).length,3);assert.ok(api.timeline(t).every(e=>e.title.startsWith('来源记录')));
 assert.equal(api.timeline({summary:'来源状态'}).length,0);assert.equal(api.stamp(null),'时间待核实');
 const events=api.timeline({history:[{type:'claimed',occurredAt:'2026-10-15T03:00:00Z',summary:'领取'}]},{status:'received',checkedAt:'2026-10-15T02:00:00Z',receivedAt:null,eventId:'receipt-123'});
 assert.equal(events.length,3);assert.match(events[0].summary,/不等于客户执行或发送/);assert.equal(events.at(-1).title,'执行器领取');
});
test('all goal, summary, evidence and diagnostics remain escaped',()=>{
 const html=api.renderTask({id:'task-1234',request:{goal:'<script>bad()</script>',market:'GCC',target:1},status:'cancelled',completedCount:0,summary:'<img>',history:[{type:'cancelled',occurredAt:null,summary:'<iframe>',evidence:[{reference:'<b>'}]}]},{status:'delivery_unknown',diagnostic:'<svg>',checkedAt:null});
 assert.doesNotMatch(html,/<script>|<img>|<iframe>|<svg>/);assert.equal((html.match(/<b>/g)||[]).length,1);assert.match(html,/&lt;b&gt;/);assert.match(html,/时间待核实/);assert.match(html,/&lt;script&gt;/);
});

test('historical bridge connectivity never overrides completed running or blocked task state',()=>{
 for(const [status,label]of [['completed','已完成'],['running','执行中'],['blocked','受阻']]){
  const html=api.renderTask({id:'synthetic-task',request:{goal:'Synthetic goal',market:'SG',target:1},
   status,completedCount:status==='completed'?1:0,summary:'Actual task checkpoint',history:[]},
   {status:'received',executionConnected:false,checkedAt:'2026-10-25T00:00:00Z'});
  assert.ok(html.includes(' · '+label+'</p>'),'actual task status is retained');
  assert.match(html,/后台.*执行器.*未连接/);
  assert.match(html,/不代表当前.*Codex.*(?:内置浏览器|浏览器)/);
  assert.doesNotMatch(html,/执行受阻：未连接客户检索及邮箱执行器/);
 }
});
