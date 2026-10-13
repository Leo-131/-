import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/contact-discovery.js';
import {executionPacket} from '../scripts/plan-workspace-round.mjs';
import {planRound} from '../scripts/plan-outreach-round.mjs';
const C=globalThis.ContactDiscovery;
const company={company:'Example Retail',country:'Saudi Arabia',website:'https://example.org'};
const checked=(stage,outcome='not_found')=>({stage,outcome,checkedAt:'2026-10-14T01:00:00+08:00',sourceUrl:'https://example.org/contact',evidence:'Public rendered source checked; no business contact found'});
test('missing official email advances through LinkedIn directors then official social, never marks success',()=>{
 let r={...company};
 for(const stage of C.fallbackOrder){assert.equal(C.contactFallbackPlan(r).nextStage,stage);r=C.recordFallbackAttempt(r,checked(stage));}
 const plan=C.contactFallbackPlan(r);assert.equal(plan.nextStage,null);assert.equal(plan.state,'channels_exhausted_evidence_pending');assert.equal(plan.eligibleToSend,false);assert.equal(plan.sendPerformed,false);
 assert.equal(r.contactFallback.attempts.length,4);assert.equal(C.points(r).length,0);
});
test('checked official-source failure switches independent channel, unknown search does not',()=>{
 assert.equal(C.contactFallbackPlan({...company,contactSearch:{status:'failed',checkedAt:'2026-10-14',sourceUrl:'https://example.org/contact'}}).nextStage,'linkedin_decision_makers');
 assert.equal(C.contactFallbackPlan({...company,contactSearch:{status:'not_found'}}).nextStage,'official_website');
});
test('immutable company/group and unknown sends precede all fallback stages',()=>{
 for(const flags of [{status:'sent_confirmed'},{status:'send_unconfirmed'},{doNotResend:true},{sentAt:'2026-10-13'},{status:'send_clicked_outcome_unknown_do_not_resend'}]){
  const r={...company,...flags};assert.equal(C.contactFallbackPlan(r).state,'company_group_locked');assert.throws(()=>C.recordFallbackAttempt(r,checked('official_website')),/locked/);
 }
 assert.equal(C.contactFallbackPlan(company,{companyOrGroupBlocked:true}).nextStage,null);
 const plan=planRound({candidates:[company],history:[{company:'Old Alias',group:'Parent',status:'sent_confirmed'}],research:[],limit:100});
 assert.equal(plan.rows.length,1);
 const blocked=planRound({candidates:[{...company,group:'Parent'}],history:[{group:'Parent',status:'sent_confirmed'}]});assert.equal(blocked.rows.length,0);
});
test('LinkedIn public email cannot skip current senior role/employer/business provenance',()=>{
 const base={...company,contactFallback:{attempts:[checked('official_website')]}};
 const p={type:'email',value:'director@example.org',status:'published',sourceUrl:'https://linkedin.com/in/director'};
 assert.equal(C.contactFallbackPlan({...base,contactPoints:[p]}).nextStage,'linkedin_decision_makers');
 const verified={...p,role:'Procurement Director',roleVerified:true,employerVerified:true,businessEmailVerified:true,roleSourceUrl:p.sourceUrl,employerSourceUrl:p.sourceUrl};
 const plan=C.contactFallbackPlan({...base,contactPoints:[verified]});assert.equal(plan.nextStage,'verify_email_and_live_gates');assert.equal(plan.eligibleToSend,false);
});
test('social presence is a candidate until official company source is verified',()=>{
 const base={...company,contactFallback:{attempts:[checked('official_website'),checked('linkedin_decision_makers')]}};
 const p={type:'instagram',value:'https://instagram.com/example',status:'published'};
 assert.equal(C.contactFallbackPlan({...base,contactPoints:[p]}).nextStage,'official_instagram');
 assert.equal(C.contactFallbackPlan({...base,contactPoints:[{...p,officialCompanyVerified:true,sourceUrl:'https://example.org'}]}).nextStage,'verify_social_and_live_gates');
});
test('attempt history is retained, bounded and stage-ordered, invalid evidence rejected',()=>{
 assert.throws(()=>C.recordFallbackAttempt(company,checked('official_facebook')),/next/);
 assert.throws(()=>C.recordFallbackAttempt(company,{...checked('official_website'),sourceUrl:'javascript:evil'}),/source/);
 assert.equal(C.profileFields({contactFallback:{attempts:[checked('official_website')]}}).contactFallback.attempts.length,1);
});
test('actual lean execution packet contains the missing-email next stage',()=>{
 const row={...company,contactSearch:{checkedAt:'2026-10-14T01:00:00+08:00',status:'not_found',sourceUrl:'https://example.org/contact'}};
 const packet=executionPacket({rows:[row],counts:{},sendPerformed:false},20,true,false,true);
 assert.equal(packet.researchTasks[0].contactFallbackPlan.nextStage,'linkedin_decision_makers');
 assert.ok(packet.researchPolicy.seniorDecisionRoles.includes('Product Director'));
 assert.equal(packet.taskContract.eligibleToSend,false);
 assert.equal(packet.researchTasks[0].contactFallbackPlan.eligibleToSend,false);
});
