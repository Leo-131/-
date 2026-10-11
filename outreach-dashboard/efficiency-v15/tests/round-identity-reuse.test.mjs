import test from 'node:test';
import assert from 'node:assert/strict';
import {planRound,identityKeys} from '../scripts/plan-outreach-round.mjs';
const e=globalThis.OutreachEfficiency,g=globalThis.OutreachQueueGuard;
function reference(input){const index=g.build(input.history||[],identityKeys);
 return e.researchPlan(input.candidates,{keys:identityKeys,
 blocked:row=>g.blocked(row,index,identityKeys),research:input.research||[],limit:100});}
test('per-round identity reuse preserves alias, group and uncertain-send locks',()=>{
 const input={candidates:[{company:'A',domain:'a.test'},{company:'Alias A',domain:'a.test'},
 {company:'B',group:'Holding'},{company:'C'}],history:[{company:'Other',group:'Holding',status:'send_unconfirmed'}],
 research:[{company:'A',email:'info@a.test',sources:['https://a.test/contact']}]};
 const actual=planRound(input),expected=reference(input);
 assert.deepEqual(actual.rows,expected.rows);assert.deepEqual(actual.counts,expected.counts);
 assert.equal(actual.sendPerformed,false);
});
test('new invocation sees mutated identity and newly confirmed receipt',()=>{
 const row={company:'A',domain:'a.test'},history=[];
 assert.equal(planRound({candidates:[row],history}).rows.length,1);
 history.push({company:'A',status:'sent_confirmed'});
 assert.equal(planRound({candidates:[row],history}).rows.length,0);
 row.company='B';row.domain='b.test';
 assert.equal(planRound({candidates:[row],history}).rows.length,1);
});
test('empty survivor context does not scan cache or expose other-company facts',()=>{
 const cache=new Proxy([],{get(){throw Error('Unnecessary cache scan');}});
 assert.deepEqual(e.researchContext([],cache),[]);
 const result=e.researchContext([{company:'A'}],[{company:'B',email:'private@b.test'},
 {company:'A',sources:['https://a.test/'],email:'info@a.test'}]);
 assert.deepEqual(result[0].cachedResearch.contactCandidates,['info@a.test']);
 assert.equal(result[0].cachedResearch.eligibleToSend,false);
});
