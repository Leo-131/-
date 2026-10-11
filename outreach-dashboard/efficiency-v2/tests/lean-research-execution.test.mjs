import test from 'node:test';
import assert from 'node:assert/strict';
import {executionPacket} from '../scripts/plan-workspace-round.mjs';
import '../web/outreach-efficiency.js';

test('buyer roles rank ahead of service seeds without excluding any candidate',()=>{
 const rows=[{company:'International School'},{company:'Building Contracting'},
   {company:'Unknown'},{company:'Trade Group',role:'distributor'},
   {company:'Camping School'},{company:'Fitness Club'}];
 assert.deepEqual(globalThis.OutreachEfficiency.prioritizeResearch(rows).map(r=>r.company),
   ['Camping School','Trade Group','Unknown','International School','Building Contracting','Fitness Club']);
 assert.ok(rows.every(r=>r.icpScore===undefined&&r.eligibleToSend===undefined));
});

test('only the current packet payload is inspected after complete safety preflight',()=>{
 const deferred={company:'Later'};
 Object.defineProperty(deferred,'description',{get(){throw Error('Deferred payload read');}});
 const plan={rows:[{company:'Now'},deferred],requiresLiveVerification:true,sendPerformed:false};
 const packet=executionPacket(plan,1,true);
 assert.equal(packet.packet.totalPending,2);assert.equal(packet.packet.deferred,1);
 assert.equal(packet.researchTasks.length,1);assert.equal(packet.packet.eligibleToSend,false);
 assert.equal(packet.requiresLiveVerification,true);assert.equal(plan.rows.length,2);
 assert.equal(packet.researchPolicy.verificationOrder[0],'current-product-and-buyer-role');
});
