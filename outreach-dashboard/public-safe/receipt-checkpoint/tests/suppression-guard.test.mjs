import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/outreach-efficiency.js';
import '../web/outreach-queue-guard.js';
// Synthetic identity fixtures only. No browser, external request or sending.
const efficiency=globalThis.OutreachEfficiency,guard=globalThis.OutreachQueueGuard;
const keys=efficiency.identityKeys;
const fresh={company:'Synthetic new alias',groupName:'Synthetic group',
  evidenceRevision:'v2',evidenceSources:['https://new.example.test/product']};
const fields=['researchStatus','status','sendStatus','automationStatus','result','state'];
test('raw suppression protects candidates, cached aliases and permanent company/group history',()=>{
  for(const status of ['optout','opt_out','opt-out','opt out','opted_out','opted-out',
    'unsubscribe','unsubscribed','do_not_contact','do-not-contact','do not contact','do_not_resend',' UNSUBSCRIBED ']){
    for(const field of fields){
      const cached={company:'Synthetic old alias',groupName:fresh.groupName,[field]:status};
      const later={...cached,[field]:'failed_open'};
      assert.equal(guard.blocked({...fresh,[field]:status},new Map(),keys),true);
      for(const history of [[cached,later],[later,cached]])
        assert.equal(guard.blocked(fresh,guard.build(history,keys),keys),true);
      const plan=efficiency.researchBatch([fresh],{keys,blocked:()=>false,research:[cached]});
      assert.equal(plan.rows.length,0);assert.equal(plan.counts.historical,1);
    }
  }
});
test('changed material source reopens research-only failure while uncertain sends remain locked',()=>{
  const previous={company:fresh.company,status:'source_failed',evidenceRevision:'v1',
    retryWithoutNewEvidence:false,evidenceSources:['https://old.example.test/']};
  const options={keys,blocked:()=>false,research:[previous]};
  assert.equal(efficiency.researchBatch([fresh],options).rows.length,1);
  assert.equal(efficiency.researchBatch([{...fresh,evidenceRevision:'v1'}],options).rows.length,0);
  assert.equal(efficiency.researchBatch([fresh],{...options,research:[{...previous,status:'send_unconfirmed'}]}).rows.length,0);
});
test('explicit cached contact locks survive new source evidence',()=>{
  for(const flag of [{doNotResend:true},{previouslyContacted:true},
    {sentAt:'2024-06-01T10:00:00Z'},{repliedAt:'2024-06-02T10:00:00Z'}]){
    const previous={company:fresh.company,status:'source_failed',evidenceRevision:'v1',...flag};
    const plan=efficiency.researchBatch([fresh],{keys,blocked:()=>false,research:[previous]});
    assert.equal(plan.rows.length,0);assert.equal(plan.counts.historical,1);
  }
});
test('ordinary rejection and notes are not reinterpreted as explicit suppression',()=>{
  for(const status of ['not_interested','rejected','declined','unsubscribe_link_present','optout_not_requested']){
    const row={company:fresh.company,status};
    assert.equal(guard.blocked(row,new Map(),keys),false);
  }
});
