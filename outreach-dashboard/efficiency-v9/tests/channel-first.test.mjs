import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/outreach-efficiency.js';
const e=globalThis.OutreachEfficiency;
test('channel-first preserves every seed without conferring eligibility',()=>{
 const rows=[{company:'Camping safari tours'},{company:'Outdoor Retailer'},
   {company:'Electronics Distributor'},{company:'Design Institute'},
   {company:'DELTA MEP'},{company:'Unknown'}];
 assert.deepEqual(e.prioritizeResearch(rows).map(r=>r.company),[
   'Outdoor Retailer','Electronics Distributor','Unknown','Camping safari tours',
   'Design Institute','DELTA MEP']);
 assert.equal(e.prioritizeResearch(rows).length,rows.length);
 assert.ok(rows.every(r=>r.icpScore===undefined));
 assert.equal(e.verificationTask(rows[1]).eligibleToSend,false);
 assert.equal(e.researchPriority(rows[1]).trust,'unverified-routing-only');
});
test('fresh history and cached failure still block high routing priorities',()=>{
 const rows=[{company:'Outdoor Retailer'},{company:'Electronics Distributor'}];
 const plan=e.researchBatch(e.prioritizeResearch(rows),{keys:e.identityKeys,
   blocked:r=>r.company==='Outdoor Retailer',research:[
     {company:'Electronics Distributor',status:'source_failed'}]});
 assert.equal(plan.rows.length,0);assert.equal(plan.sendPerformed,false);
 assert.equal(plan.requiresLiveVerification,true);
});
