import test from 'node:test';
import assert from 'node:assert/strict';
import {executionPacket} from '../scripts/plan-workspace-round.mjs';
import '../web/outreach-efficiency.js';
test('packet carries bounded research context without raw provider fields',()=>{
 const p=executionPacket({rows:[{company:'Shop',country:'UAE',industry:'retail',role:'distributor',
   description:'x'.repeat(10000),keywords:Array.from({length:100},()=> 'power bank'),raw:'secret'}]});
 assert.equal(p.rows[0].country,'UAE');assert.equal(p.rows[0].description.length,240);
 assert.equal(p.rows[0].keywords.length,8);assert.equal(p.rows[0].raw,undefined);
 assert.equal(p.researchTasks[0].country,'UAE');assert.equal(p.researchTasks[0].eligibleToSend,false);
 assert.ok(p.researchPolicy.requiredLiveChecks.includes('canonical-ICP>70'));
});
test('cached leads route research but never remove live checks or conflicts',()=>{
 const task=globalThis.OutreachEfficiency.verificationTask({company:'Shop',icp:100,
  cachedResearch:{sourceUrls:['https://shop.test/contact'],contactCandidates:['a@shop.test','b@shop.test'],contactConflict:true}});
 assert.equal(task.contactConflict,true);assert.equal(task.country,undefined);
 assert.deepEqual(task.missingCachedLeads,['country']);assert.equal(globalThis.OutreachEfficiency.researchPolicy.requiredLiveChecks.length,5);
 assert.equal(globalThis.OutreachEfficiency.researchPolicy.onPrimarySourceFailure,'record-reason-and-switch-candidate');
 assert.equal(task.eligibleToSend,false);assert.equal(task.icp,undefined);
});
test('packet refresh and unknown evidence remain explicit and bounded',()=>{
 const p=executionPacket({rows:Array.from({length:100},(_,i)=>({company:String(i),domain:'shop.ae'}))},10);
 assert.equal(p.researchTasks.length,10);assert.equal(p.packet.deferred,90);
 assert.equal(p.packet.refreshBeforeNextPacket,true);
 assert.deepEqual(p.researchTasks[0].missingCachedLeads,['official-source','public-business-contact','country']);
 assert.equal(p.researchTasks[0].country,undefined); // no geography guessed from domain
});
