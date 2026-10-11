import test from 'node:test';
import assert from 'node:assert/strict';
import {executionPacket} from '../scripts/plan-workspace-round.mjs';
const efficiency=globalThis.OutreachEfficiency;
test('buyer hints rank first without conferring eligibility or requiring identical stocked SKUs',()=>{
  const rows=[{company:'Camping Shop',industry:'outdoor retail'},
    {company:'Camping Buyer',industry:'outdoor retail',role:'category manager'}];
  assert.equal(efficiency.prioritizeResearch(rows)[0].company,'Camping Buyer');
  assert.equal(efficiency.researchPriority(rows[1]).eligibleToSend,false);
  assert.equal(efficiency.researchPriority(rows[1]).trust,'unverified-routing-only');
});
test('lean packets preserve complete task identities, sources and conflicts under a shared safety contract',()=>{
  const plan={rows:Array.from({length:20},(_,i)=>({company:'Shop '+i,domain:i+'.test',
    aliases:['Alias '+i],cachedResearch:{sourceUrls:['https://'+i+'.test/contact'],
      contactCandidates:['sales@'+i+'.test'],contactConflict:true}})),
    sendPerformed:false,requiresLiveVerification:true};
  const normal=executionPacket(plan,20,true,true);
  const lean=executionPacket(plan,20,true,true,true);
  for(let i=0;i<20;i++)assert.deepEqual({...lean.researchTasks[i],eligibleToSend:false},normal.researchTasks[i]);
  assert.deepEqual(lean.sourceBatches,normal.sourceBatches);
  assert.equal(lean.taskContract.eligibleToSend,false);
  assert.equal(lean.taskContract.appliesTo,'every-research-task');
  assert.equal(lean.sendPerformed,false);assert.equal(lean.requiresLiveVerification,true);
  assert.ok(JSON.stringify(lean).length<JSON.stringify(normal).length);
  assert.throws(()=>executionPacket(plan,20,false,true,true),/tasks-only/);
});

