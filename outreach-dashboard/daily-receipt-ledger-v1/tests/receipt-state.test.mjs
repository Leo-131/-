import test from 'node:test';
import assert from 'node:assert/strict';
import {actualExecutionDay,receiptBatchDate,buildDailyLedger,missingVerifiedReceipts} from '../scripts/receipt-state.mjs';
const row=(n,extra={})=>({company:'Company '+n,country:'Indonesia',icp:71.4,status:'sent_confirmed',
  mailId:'1_0:example-'+n,sentAtLocal:'2026-10-13T22:33:00+08:00',executionDate:'2026-10-13',...extra});
const daily=options=>buildDailyLedger({date:'2026-10-13',...options});
test('fixed 99th batch remains separate from daily count',()=>{
  const fixed={date:'2026-10-10',target:100,confirmedCount:99,records:Array.from({length:99},(_,i)=>row(i))};
  assert.equal(receiptBatchDate(fixed,'2026-10-13'),'2026-10-10');
  const closed={...fixed,confirmedCount:100,records:[...fixed.records,row(100)]};
  assert.equal(receiptBatchDate(closed,'2026-10-13'),'2026-10-13');
  assert.equal(fixed.confirmedCount,99);assert.equal(closed.confirmedCount,100);
});
test('fixed and daily copies count once while an actual new receipt increments once',()=>{
  const existing=daily({fixedRecords:[row(1),row(2),row(3)]});
  const result=daily({fixedRecords:[row(1),row(2),row(3)],existing,receipt:row(4)});
  assert.equal(result.confirmedCount,4);assert.equal(result.remaining,96);
  assert.equal(existing.confirmedCount,3);
});
test('old fixed receipts do not become today sends',()=>{
  const old=row(0,{sentAtLocal:'2026-10-10T19:00:00+08:00',executionDate:'2026-10-10'});
  assert.equal(daily({fixedRecords:[old,row(1)]}).confirmedCount,1);
});
test('unknown outcomes, drafts, low scores and missing country never enter count',()=>{
  for(const patch of [{status:'send_unconfirmed'},{status:'prepared_not_sent'},
    {mailId:'5_0:draft'},{icp:70},{country:''},{country:'unknown'},{country:'Global / Unspecified'}])assert.throws(()=>daily({receipt:row(1,patch)}));
});
test('same company or group cannot inflate daily unique counts',()=>{
  assert.throws(()=>daily({fixedRecords:[row(1),row(2,{company:'Company 1'})]}));
  assert.throws(()=>daily({fixedRecords:[row(1,{aliases:['Parent']}),row(2,{group:'Parent'})]}));
});
test('same message ID with conflicting company fails closed',()=>{
  assert.throws(()=>daily({fixedRecords:[row(1),row(2,{mailId:row(1).mailId})]}));
});
test('UTC timestamps use actual Shanghai date and cannot be backdated',()=>{
  assert.equal(actualExecutionDay(row(1,{sentAtLocal:'2026-10-12T16:01:00Z'})),'2026-10-13');
  assert.throws(()=>actualExecutionDay(row(1,{sentAtLocal:'2026-10-13T16:01:00Z'})));
  assert.throws(()=>daily({receipt:row(1,{sentAtLocal:'2026-10-14T01:00:00+08:00',executionDate:'2026-10-14'})}));
});
test('corrupt fixed/daily counters are not silently repaired',()=>{
  assert.throws(()=>receiptBatchDate({date:'2026-10-10',target:100,confirmedCount:100,records:[]},'2026-10-13'));
  assert.throws(()=>daily({existing:{date:'2026-10-13',confirmedCount:2,records:[row(1)]}}));
});
test('existing user metadata is preserved without changing receipt identity',()=>{
  const existing={...daily({fixedRecords:[row(1)]}),note:'user annotation'};
  existing.records[0]={...existing.records[0],note:'receipt annotation'};
  const result=daily({fixedRecords:[row(1)],existing});
  assert.equal(result.note,'user annotation');assert.equal(result.records[0].note,'receipt annotation');
  assert.throws(()=>daily({fixedRecords:[row(1)],existing:{...existing,records:[row(1,{country:'Vietnam'})]}}));
});
test('private source sync includes new actual-date campaign receipts, not just old batch',()=>{
  const fixed={task_id:'verified-email-one-2026-10-10',status:'sent_confirmed',messageId:'1_0:one',
    country:'Indonesia',icpScore:71.4,batchDate:'2026-10-10',executionDate:'2026-10-13',timestamp:'2026-10-13T14:33:00Z'};
  const next={...fixed,task_id:'verified-email-two-2026-10-13',messageId:'1_0:two',batchDate:'2026-10-13'};
  assert.deepEqual(missingVerifiedReceipts([fixed,next,next],[fixed]),[next]);
  assert.throws(()=>missingVerifiedReceipts([{...next,executionDate:'2026-10-10'}],[]));
  assert.throws(()=>missingVerifiedReceipts([{...next,messageId:'5_0:draft'}],[]));
});
