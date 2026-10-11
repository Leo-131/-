import test from 'node:test';
import assert from 'node:assert/strict';
import {compactSourceEvidence as compact} from '../scripts/compact-source-evidence.mjs';

test('source summary removes navigation duplicates while retaining numbered evidence',()=>{
  const raw='Shop (https://shop.test/)\nturn23view0 Source: open({"ref_id":"https://shop.test/"});\n'
    +Array.from({length:150},(_,i)=>`L${i}: * Menu retail camping`).join('\n')
    +'\nL151: Dubai retail distributor for portable power banks\nL152: sales@shop.test\nL153: Dubai retail distributor for portable power banks';
  const result=compact(raw);
  assert.equal(result.sourceCount,1);assert.equal(result.sources[0].reference,'turn23view0');
  assert.equal(result.sources[0].sourceUrl,'https://shop.test/');
  assert.ok(JSON.stringify(result).length<raw.length/2);
  assert.deepEqual(result.sources[0].evidence.product,['L151: Dubai retail distributor for portable power banks']);
  assert.deepEqual(result.sources[0].evidence.contact,['L152: sales@shop.test']);
  assert.equal(result.eligibleToSend,false);assert.equal(result.lossy,true);
});
test('failure persists switching instruction but never fabricates a business fact',()=>{
  const result=compact('Internal Error ()\nturn1view2 Source: open({"ref_id":"https://failed.test/"});\nL0: URL is not accessible via this tool.');
  assert.equal(result.sources[0].status,'source_failed');
  assert.equal(result.sources[0].evidence,undefined);assert.equal(result.modelCalls,0);
});
test('metadata or omitted fields cannot qualify or exclude a company',()=>{
  const result=compact('Shop ()\nturn2view0 Source: open({"ref_id":"https://shop.test/"}); Total lines: 0');
  assert.equal(result.sources[0].status,'review_required');
  assert.deepEqual(result.sources[0].evidence,{});
  assert.match(result.contract,/do not establish absence/);
});
test('batch boundaries preserve every source and original hash changes on new evidence',()=>{
  const raw='A ()\nturn2view0\nL1: Camping retail distributor\n--------------------\nB ()\nturn2view1\nL1: CCTV systems installation services';
  const a=compact(raw),b=compact(raw+'\nL2: Updated products');
  assert.equal(a.sources.length,2);assert.notEqual(a.rawSha256,b.rawSha256);
  assert.equal(a.rawSha256.length,64);assert.match(a.sources[1].evidence.role[0],/CCTV/);
});
test('rejects empty input and caps each evidence category',()=>{
  assert.throws(()=>compact(''),/Nonempty/);
  const result=compact(Array.from({length:100},(_,i)=>`L${i}: Portable camping product description ${i}`).join('\n'));
  assert.equal(result.sources[0].evidence.product.length,3);
});
