import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHistoryExport} from '../scripts/plan-workspace-round.mjs';
test('pure history data takes JSON path without changing rows',()=>{
  const parsed=parseHistoryExport('window.RECORDS = [{"company":"A","status":"send_unconfirmed"}];','RECORDS');
  assert.equal(parsed.mode,'json');
  assert.deepEqual(parsed.value,[{company:'A',status:'send_unconfirmed'}]);
});
test('legacy computed history retains isolated VM compatibility',()=>{
  const parsed=parseHistoryExport('window.RECORDS = [{company:"A"}].map(x=>x);','RECORDS');
  assert.equal(parsed.mode,'vm');assert.equal(parsed.value[0].company,'A');
});
test('wrong global and broken data cannot become valid history',()=>{
  assert.equal(parseHistoryExport('window.WRONG=[];','RECORDS').value,undefined);
  assert.throws(()=>parseHistoryExport('window.RECORDS=[broken;','RECORDS'));
});

