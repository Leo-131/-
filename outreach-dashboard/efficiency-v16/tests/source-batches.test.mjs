import test from 'node:test';
import assert from 'node:assert/strict';
import {executionPacket} from '../scripts/plan-workspace-round.mjs';

test('bounded source navigation removes repeated URLs without losing company references',()=>{
 const rows=Array.from({length:20},(_,i)=>({company:'Company '+i,domain:`shop${Math.floor(i/2)}.test`}));
 const p=executionPacket({rows,sendPerformed:false,requiresLiveVerification:true},20,true,true);
 assert.deepEqual(p.sourceBatches.batches.map(b=>b.length),[4,4,2]);
 assert.deepEqual(p.sourceBatches.batches[0][0].taskIndexes,[0,1]);
 assert.equal(p.sourceBatches.eligibleToSend,false); assert.equal(p.sendPerformed,false);
 assert.equal(p.researchTasks.length,20); assert.equal(rows.length,20);
});
test('unsafe and unavailable hints stay unresolved, never generate invented official evidence',()=>{
 const rows=['javascript:alert(1)','http://localhost','http://127.0.0.1/','https://user:secret@shop.test',
 'https://shop.test:8443','https://office.local','https://[::1]/',null].map(website=>({website}));
 const p=globalThis.OutreachEfficiency.sourceBatches(rows);
 assert.deepEqual(p.unresolvedTaskIndexes,[0,1,2,3,4,5,6,7]); assert.deepEqual(p.batches,[]);
 assert.equal(p.hintsOnly,true);
});
test('current packet only and optional feature retain refresh and fresh history guarantees',()=>{
 const plan={rows:[{company:'A',domain:'a.test',cachedResearch:{sourceUrls:['https://a.test/about#x']}},
 {company:'B',domain:'b.test'}],counts:{historical:5},inputs:{snapshotDigest:'fresh'}};
 const p=executionPacket(plan,1,true,true);
 assert.equal(p.sourceBatches.batches[0][0].url,'https://a.test/about');
 assert.equal(p.packet.deferred,1); assert.equal(p.packet.refreshBeforeNextPacket,true);
 assert.deepEqual(p.counts,plan.counts); assert.equal(p.inputs.snapshotDigest,'fresh');
 assert.equal(executionPacket(plan,1,true).sourceBatches,undefined);
 assert.throws(()=>globalThis.OutreachEfficiency.sourceBatches([],5),/1 to 4/);
});
