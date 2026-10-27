import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/outreach-efficiency.js';

test('mixed valid and missing source hints keep valid open requests ordered without mutating raw rows',()=>{
 const rows=[
  {company:'First',website:'https://first.test/products#overview',country:null},
  {company:'Null source',website:null,sourceUrl:null},
  {company:'Blank source',website:' \t '},
  {company:'Numeric source',website:42},
  {company:'Second',website:'https://second.test/'},
  {company:'Shared first',website:'https://first.test/products#details'},
  {company:'Object source',website:{url:'https://not-a-string.test/'}},
  {company:'Domain hint',domain:'third.test',score:null}
 ];
 const before=structuredClone(rows);
 const result=globalThis.OutreachEfficiency.sourceBatches(rows);
 const sources=result.batches.flat();
 const open=sources.map(item=>({ref_id:item.url}));
 assert.deepEqual(open,[{ref_id:'https://first.test/products'},
  {ref_id:'https://second.test/'},{ref_id:'https://third.test/'}]);
 assert.ok(open.every(item=>typeof item.ref_id==='string'&&item.ref_id.length>0));
 assert.deepEqual(sources.map(item=>item.taskIndexes),[[0,5],[4],[7]]);
 assert.deepEqual(result.unresolvedTaskIndexes,[1,2,3,6]);
 assert.deepEqual(rows,before);
 assert.equal(result.hintsOnly,true);
 assert.equal(result.eligibleToSend,false);
});
