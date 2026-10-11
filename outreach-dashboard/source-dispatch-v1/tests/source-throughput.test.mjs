import test from 'node:test';
import assert from 'node:assert/strict';
import {planRound} from '../scripts/plan-outreach-round.mjs';
import {executionPacket} from '../scripts/plan-workspace-round.mjs';
const e=globalThis.OutreachEfficiency;

test('installed and industrial routing clues defer, never exclude or qualify',()=>{
 const rows=[{company:'AV integrator',industry:'digital signage distributor'},
  {company:'Portable power wholesale'}, {company:'Neutral'},
  {company:'Smart home camping retailer',industry:'camping products'}];
 const ordered=e.prioritizeResearch(rows);
 assert.deepEqual(ordered.map(r=>r.company),['Portable power wholesale',
  'Smart home camping retailer','Neutral','AV integrator']);
 assert.equal(ordered.length,rows.length);
 assert.equal(e.researchPriority(rows[0]).eligibleToSend,false);
 assert.equal(e.researchPriority(rows[0]).trust,'unverified-routing-only');
 assert.equal(rows[0].icpScore,undefined);
});

test('read-only request batching retains references and irreversible serial boundary',()=>{
 const p=executionPacket({rows:Array.from({length:20},(_,i)=>({company:'C'+i,domain:`c${i}.test`}))},20,true,true);
 assert.deepEqual(p.sourceBatches.batches.map(b=>b.length),[8,8,4]);
 assert.equal(p.sourceBatches.readPolicy.maxConcurrent,8);
 assert.equal(p.sourceBatches.readPolicy.requestsPerSource,1);
 assert.equal(p.sourceBatches.readPolicy.controlBoundary,'no-browser-writes-or-sends-in-parallel');
 assert.equal(p.sourceBatches.readPolicy.explicitFailure,'persist-reason-no-repeat-without-new-evidence');
 assert.equal(p.packet.eligibleToSend,false);
 assert.equal(p.packet.refreshBeforeNextPacket,true);
});

test('higher throughput never releases permanent group or unknown-send locks',()=>{
 const p=planRound({candidates:[{company:'Portable power wholesale',group:'G'},
  {company:'Camping distributor',domain:'c.test'},{company:'Neutral'}],
 history:[{company:'Old',group:'G',status:'sent_confirmed'}],
 research:[{company:'Other',domain:'c.test',status:'send_clicked_outcome_unknown_do_not_resend'}]});
 assert.deepEqual(p.rows.map(r=>r.company),['Neutral']);
 assert.equal(p.sendPerformed,false);
 assert.equal(p.modelCalls,0);
});
