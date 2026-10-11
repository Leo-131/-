import test from 'node:test';
import assert from 'node:assert/strict';
import {planRound,identityKeys} from '../scripts/plan-outreach-round.mjs';

function legacy(input) {
  const e=globalThis.OutreachEfficiency,g=globalThis.OutreachQueueGuard;
  const index=g.build(input.history||[],identityKeys);
  const options={keys:identityKeys,blocked:r=>g.blocked(r,index,identityKeys),research:input.research||[]};
  const screened=e.researchBatch(input.candidates,{...options,screenOnly:true});
  const ordered=e.prioritizeVerification(e.prioritizeResearch(e.researchContext(screened.rows,options.research)));
  const result=e.researchBatch(ordered,{...options,limit:input.limit});
  return {rows:result.rows,counts:{historical:screened.counts.historical+result.counts.historical,
    parked:screened.counts.parked+result.counts.parked,duplicate:result.counts.duplicate}};
}
test('single-pass output matches two-pass locks, aliases, priorities and limits',()=>{
  for(const limit of [1,10,100,150,0]) {
    const candidates=Array.from({length:150},(_,i)=>({company:'Company '+i,
      domain:`firm${i%90}.test`,group:`Group ${i%80}`,
      description:i%3?'consumer electronics retailer':'outdoor tours'}));
    const input={candidates,limit,history:[{group:'Group 2',status:'send_unconfirmed'}],
      research:[{company:'Company 5',status:'source_failed'},
        {company:'Company 9',publicEmail:'hello@firm9.test',sources:['https://firm9.test/contact']}]};
    const actual=planRound(input),expected=legacy(input);
    assert.deepEqual(actual.rows,expected.rows);assert.deepEqual(actual.counts,expected.counts);
    assert.equal(actual.sendPerformed,false);assert.equal(actual.requiresLiveVerification,true);
  }
});
test('next invocation sees a newly recorded receipt even when inputs reuse objects',()=>{
  const input={candidates:[{company:'A',group:'Parent'},{company:'B'}],research:[]};
  assert.equal(planRound(input).rows.length,2);
  input.research.push({group:'Parent',status:'send_clicked_outcome_unknown_do_not_resend'});
  const next=planRound(input);assert.deepEqual(next.rows.map(r=>r.company),['B']);
  assert.equal(next.counts.historical,1);
});
test('research lock index is not rebuilt after ordering',()=>{
  let reads=0;
  const research=[{company:'Parked',get status(){reads++;return 'source_failed';}}];
  const input={candidates:[{company:'Fresh'}],research};
  planRound(input);const singlePassReads=reads;reads=0;
  legacy(input);assert.equal(reads,singlePassReads+1);
});
