import test from 'node:test';
import assert from 'node:assert/strict';
import {executionPacket} from '../scripts/plan-workspace-round.mjs';
test('tasks-only removes duplicated descriptions but retains identity, conflicts and live gates',()=>{
 const plan={rows:[{company:'Retailer',domain:'shop.test',groupName:'Parent',aliases:['Old Name'],
 description:'x'.repeat(240),cachedResearch:{sourceUrls:['https://shop.test/contact'],
 contactCandidates:['one@shop.test','two@shop.test'],contactConflict:true}}],
 counts:{historical:8,parked:9},sendPerformed:false,requiresLiveVerification:true,inputs:{snapshotDigest:'fresh'}};
 const original=executionPacket(plan),lean=executionPacket(plan,10,true);
 assert.equal(lean.rows,undefined);assert.equal(lean.researchTasks[0].company,'Retailer');
 assert.equal(lean.researchTasks[0].identity.groupName,'Parent');
 assert.deepEqual(lean.researchTasks[0].identity.aliases,['Old Name']);
 assert.equal(lean.researchTasks[0].contactConflict,true);
 assert.deepEqual(lean.researchTasks[0].sourceUrls,['https://shop.test/contact']);
 assert.deepEqual(lean.counts,original.counts);assert.equal(lean.packet.eligibleToSend,false);
 assert.equal(lean.packet.refreshBeforeNextPacket,true);assert.equal(lean.inputs.snapshotDigest,'fresh');
 assert.equal(lean.sendPerformed,false);assert.equal(lean.requiresLiveVerification,true);
 assert.ok(JSON.stringify(lean).length<JSON.stringify(original).length);
 assert.equal(plan.rows.length,1);
});
