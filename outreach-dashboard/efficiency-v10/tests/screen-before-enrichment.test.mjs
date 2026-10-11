import test from 'node:test';
import assert from 'node:assert/strict';
import {planRound} from '../scripts/plan-outreach-round.mjs';

test('historical and parked candidates never read expensive descriptions',()=>{
 const sent={company:'Sent',group:'Parent'};
 const parked={company:'Parked'};
 for(const row of [sent,parked])Object.defineProperty(row,'description',{
   enumerable:true,get(){throw Error('Blocked candidate enriched');}});
 const plan=planRound({candidates:[sent,parked,{company:'Fresh'}],
   history:[{company:'Parent',status:'send_unconfirmed'}],
   research:[{company:'Parked',status:'source_failed'}]});
 assert.deepEqual(plan.rows.map(r=>r.company),['Fresh']);
 assert.deepEqual(plan.counts,{historical:1,parked:1,duplicate:0});
 assert.equal(plan.preflightWork.skippedContextRows,2);
 assert.equal(plan.sendPerformed,false);assert.equal(plan.requiresLiveVerification,true);
});

test('best alias remains selected after screening and fresh receipts immediately block it',()=>{
 const candidates=[{company:'Neutral',domain:'same.test'},
   {company:'Outdoor distributor',domain:'same.test'}, {company:'Second'}];
 const first=planRound({candidates});
 assert.deepEqual(first.rows.map(r=>r.company),['Outdoor distributor','Second']);
 assert.equal(first.counts.duplicate,1);
 const next=planRound({candidates,history:[{domain:'same.test',status:'sent_confirmed'}]});
 assert.deepEqual(next.rows.map(r=>r.company),['Second']);
 assert.equal(next.counts.historical,2);
});

test('new evidence still requires both revision and a new source; no score authorizes sending',()=>{
 const research=[{company:'A',status:'evidence_insufficient',evidenceRevision:'1',
   evidenceSources:['https://a.test/old']}];
 const same=planRound({candidates:[{company:'A',icpScore:100,evidenceRevision:'2',
   evidenceSources:['https://a.test/old']}],research});
 assert.equal(same.rows.length,0);
 const fresh=planRound({candidates:[{company:'A',evidenceRevision:'2',
   evidenceSources:['https://a.test/new']}],research});
 assert.equal(fresh.rows.length,1);assert.equal(fresh.requiresLiveVerification,true);
 assert.equal(fresh.batchWaitMs,0);assert.equal(fresh.transport,'iab');
 assert.equal(globalThis.OutreachEfficiency.researchPolicy.keywordIntentMeaning,
   'category-relevance-proxy-not-expressed-purchase-intent');
});
