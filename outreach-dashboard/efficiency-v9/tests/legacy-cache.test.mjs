import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/outreach-efficiency.js';

test('legacy no-retry applies to parent aliases and requires a genuinely new source',()=>{
  const prior={company:'Example subsidiary',group:'Example parent',
    status:'pending_public_contact',reResearchWithoutNewEvidence:false,
    evidenceRevision:'v1',evidenceSources:['https://example.test/old']};
  const options={keys:globalThis.OutreachEfficiency.identityKeys,blocked:()=>false,research:[prior]};
  for (const candidate of [{company:'Example parent'},
    {company:'Example parent',evidenceRevision:'v2',evidenceSources:['https://example.test/old']}]) {
    const plan=globalThis.OutreachEfficiency.researchBatch([candidate],options);
    assert.equal(plan.rows.length,0);
    assert.equal(plan.counts.parked,1);
    assert.equal(plan.sendPerformed,false);
  }
  const plan=globalThis.OutreachEfficiency.researchBatch([
    {company:'Example parent',evidenceRevision:'v2',evidenceSources:['https://example.test/new']}],options);
  assert.equal(plan.rows.length,1);
  assert.equal(plan.requiresLiveVerification,true);
  assert.equal(plan.sendPerformed,false);
});
