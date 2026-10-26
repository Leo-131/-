import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifiedReceiptKey} from '../scripts/channel-receipt-state.mjs';
import {buildDailyLedger,missingVerifiedReceipts} from '../scripts/receipt-state.mjs';
import {buildCampaignCheckpoint,campaignReceiptDigest} from '../scripts/campaign-checkpoint-state.mjs';
const date='2026-10-13',hash=x=>createHash('sha256').update(x).digest('hex');
// Synthetic proof fixtures only; no message, screenshot or real outreach exists.
function social(extra={}){
 const body='Synthetic outgoing fixture, never sent.';
 return {company:'Fixture Social Company',group:'Fixture Group',aliases:['Fixture Parent'],country:'Singapore',icp:70.4,
  channel:'linkedin',status:'sent_confirmed',sentAtLocal:date+'T12:30:00+08:00',executionDate:date,batchDate:date,
  officialSocialUrl:'https://www.linkedin.com/company/fixture-company/',source:'https://fixture.invalid/',
  receiptEvidence:{channel:'linkedin',senderProfileUrl:'https://www.linkedin.com/in/fixture-sender/',
   recipientProfileUrl:'https://www.linkedin.com/company/fixture-company/',conversationUrl:'https://www.linkedin.com/messaging/thread/fixture-thread/',
   body,bodySha256:hash(body),independentlyReopened:true,outgoingVisible:true,senderVerified:true,recipientVerified:true,
   screenshotSha256:hash('synthetic screenshot bytes'),observedAt:date+'T12:31:00+08:00'},...extra};
}
function instagram(extra={}){
 const row=social(),recipient='https://www.instagram.com/synthetic_fixture_company/';
 return {...row,channel:'instagram',officialSocialUrl:recipient,
  receiptEvidence:{...row.receiptEvidence,channel:'instagram',
   senderProfileUrl:'https://www.instagram.com/synthetic_fixture_sender/',recipientProfileUrl:recipient,
   conversationUrl:'https://www.instagram.com/direct/t/900000000000000000001/'},...extra};
}
const email=(extra={})=>({company:'Fixture Email Company',country:'Singapore',icp:70.4,channel:'email',status:'sent_confirmed',
 mailId:'1_0:synthetic-email',sentAtLocal:date+'T11:00:00+08:00',executionDate:date,...extra});
const campaign=()=>({id:'fixture-500',target:500,confirmedCount:0,remaining:500,startedAt:date+'T00:00:00+08:00',records:[],excludedReceipts:[]});
const reconcile=(c,d,r)=>buildCampaignCheckpoint({campaign:c,daily:d,receipt:r,verifiedAt:date+'T12:35:00+08:00'});

test('verified social fixture increments the existing daily and campaign counts once without an email ID',()=>{
 const r=social(),d=buildDailyLedger({date,receipt:r}),out=reconcile(campaign(),d,r);
 assert.equal(d.confirmedCount,1);assert.equal(out.campaign.confirmedCount,1);assert.equal(out.campaign.remaining,499);
 assert.match(out.continuation.lastReceiptId,/^linkedin-evidence-sha256:/);
 assert.equal(out.campaign.records[0].mailId,undefined);assert.equal(out.campaign.records[0].providerMessageId,undefined);
 const repeat=reconcile(out.campaign,d,r);assert.equal(repeat.campaign.confirmedCount,1);
});
test('email and social receipts for one company or group cannot count as two',()=>{
 const first=email({group:'Fixture Group'}),d=buildDailyLedger({date,receipt:first}),c=reconcile(campaign(),d,first).campaign;
 assert.throws(()=>buildDailyLedger({date,existing:d,receipt:social()}));
 const separateDaily=buildDailyLedger({date,receipt:social()});assert.throws(()=>reconcile(c,separateDaily,social()));
});
test('prior excluded email group cannot be revived through a social receipt',()=>{
 const c=campaign();c.excludedReceipts=[email({group:'Fixture Group',countAsNewCustomer:false,deliveryStatus:'hard_bounced'})];
 const r=social(),d=buildDailyLedger({date,receipt:r});assert.throws(()=>reconcile(c,d,r));
});
test('incomplete proof, invited, unknown, excluded or low-score fixtures never count',()=>{
 const bad=social();delete bad.receiptEvidence.independentlyReopened;
 for(const row of [bad,social({status:'accepted'}),social({status:'send_unconfirmed'}),social({icp:70}),social({countAsNewCustomer:false})])
  assert.throws(()=>buildDailyLedger({date,receipt:row}));
});
test('private permanent source sync accepts only a fully typed new social receipt and stays idempotent',()=>{
 const r=social(),p={...r,task_id:'verified-social-linkedin-fixture-'+date,icpScore:r.icp,timestamp:r.sentAtLocal};
 p.receiptKey=verifiedReceiptKey(p);assert.deepEqual(missingVerifiedReceipts([p],[]),[p]);
 assert.deepEqual(missingVerifiedReceipts([p],[p]),[]);const bad={...p,receiptEvidence:{...p.receiptEvidence,outgoingVisible:false}};
 assert.throws(()=>missingVerifiedReceipts([bad],[]));
});
test('email-only receipt content digest remains unchanged by channel support',()=>{
 const r=email(),d=buildDailyLedger({date,receipt:r}),c=reconcile(campaign(),d,r).campaign;
 const a=campaignReceiptDigest({campaign:c,daily:d}),b=campaignReceiptDigest({campaign:structuredClone(c),daily:structuredClone(d)});
 assert.equal(a,b);
 // Independently evaluated against original56b7f6a email-only implementation.
 assert.equal(a,'7f0f1503b958366b00936d9a172afca1a5b79a15bb07e09e762e742d6ae38963');
});

test('one verified company social profile cannot be counted twice under different display names',()=>{
 const first=social(),d=buildDailyLedger({date,receipt:first}),c=reconcile(campaign(),d,first).campaign;
 const second=social({company:'Different synthetic trading label',group:undefined,aliases:[],
  sentAtLocal:date+'T12:30:10+08:00',receiptEvidence:{...first.receiptEvidence,
   body:'A different synthetic message.',bodySha256:hash('A different synthetic message.')}});
 assert.throws(()=>buildDailyLedger({date,existing:d,receipt:second}),/Company\/group already counted/);
 assert.throws(()=>reconcile(c,buildDailyLedger({date,receipt:second}),second),/Company\/group already contacted or excluded/);
 const excluded=campaign();excluded.excludedReceipts=[{...first,countAsNewCustomer:false}];
 assert.throws(()=>reconcile(excluded,buildDailyLedger({date,receipt:second}),second),/Company\/group already contacted or excluded/);
});

test('same actual social message accepts additive re-observation without counting twice or dropping prior proof',()=>{
 const first=social(),d=buildDailyLedger({date,receipt:first}),c=reconcile(campaign(),d,first).campaign;
 const later=social({receiptEvidence:{...first.receiptEvidence,observedAt:date+'T12:32:00+08:00',
  screenshotSha256:hash('second synthetic screenshot')}});
 const nextDaily=buildDailyLedger({date,existing:d,receipt:later}),next=reconcile(c,nextDaily,later);
 assert.equal(nextDaily.confirmedCount,1);assert.equal(next.campaign.confirmedCount,1);
 assert.equal(nextDaily.records[0].receiptEvidenceHistory.length,2);
 assert.equal(next.campaign.records[0].receiptEvidenceHistory.length,2);
 assert.equal(next.campaign.records[0].receiptEvidence.screenshotSha256,later.receiptEvidence.screenshotSha256);
 assert.equal(next.continuation.lastReceiptId,verifiedReceiptKey(first));
 const repeated=reconcile(next.campaign,nextDaily,later);
 assert.equal(repeated.campaign.confirmedCount,1);
 assert.deepEqual(repeated.campaign.records[0].receiptEvidenceHistory,next.campaign.records[0].receiptEvidenceHistory);
 assert.equal(c.records[0].receiptEvidenceHistory,undefined,'the prior snapshot is immutable');
});

test('permanent source sync calculates keys only for strictly typed complete existing social receipts',()=>{
 const row=social(),p={...row,task_id:'verified-social-linkedin-fixture-'+date,icpScore:row.icp,timestamp:row.sentAtLocal};
 const key=verifiedReceiptKey(p);
 assert.equal(p.receiptKey,undefined);assert.equal(p.messageId,undefined);
 assert.deepEqual(missingVerifiedReceipts([p],[p]),[],'optional stored key cannot cause duplicate ingestion');
 assert.deepEqual(missingVerifiedReceipts([p],[{channel:'linkedin',status:'sent_confirmed',receiptKey:key}]),[p],
  'an untyped legacy social assertion is not a verified message');
 assert.deepEqual(missingVerifiedReceipts([p],[{...p,status:'invitation_sent',receiptKey:key}]),[p]);
 assert.deepEqual(missingVerifiedReceipts([p],[{channel:'website_form',receiptKey:key,messageId:key}]),[p]);
 assert.throws(()=>missingVerifiedReceipts([p],[{...p,receiptEvidence:{...p.receiptEvidence,outgoingVisible:false}}]));
 assert.throws(()=>missingVerifiedReceipts([{...p,channel:'email',mailId:'1_0:synthetic'}],[]),/task\/channel mismatch/);
 const emailSource={...email(),task_id:'verified-email-fixture-'+date,icpScore:70.4,batchDate:date,
  messageId:'1_0:synthetic-email',timestamp:date+'T11:00:00+08:00'};
 assert.deepEqual(missingVerifiedReceipts([emailSource],[{messageId:emailSource.messageId}]),[],
  'the preexisting email index remains compatible');
});

test('daily and campaign ingestion reject poisoned retained social evidence',()=>{
 const original=social(),poisoned=social({receiptEvidenceHistory:[{...original.receiptEvidence,
  conversationUrl:'https://www.linkedin.com/messaging/thread/another-synthetic-thread/'}]});
 assert.throws(()=>buildDailyLedger({date,receipt:poisoned}));
 const daily=buildDailyLedger({date,receipt:original});
 assert.throws(()=>reconcile(campaign(),daily,poisoned));
});

test('a verified Instagram receipt counts once without an email ID and preserves checkpoint safety metadata',()=>{
 const row=instagram(),daily=buildDailyLedger({date,receipt:row}),before=structuredClone(row),out=reconcile(campaign(),daily,row);
 assert.equal(daily.confirmedCount,1);assert.equal(out.campaign.confirmedCount,1);assert.equal(out.continuation.confirmedToday,1);
 assert.match(out.continuation.lastReceiptId,/^instagram-evidence-sha256:/);assert.equal(out.campaign.records[0].mailId,undefined);
 assert.equal(out.campaign.records[0].providerMessageId,undefined);assert.equal(out.continuation.synchronization.verified,false);
 assert.equal(out.campaign.execution.latestAudit.actualExecutionDate,date);assert.deepEqual(row,before);
 assert.equal(reconcile(out.campaign,daily,row).campaign.confirmedCount,1);
});
test('Instagram re-observations merge screenshots into daily and campaign history without duplicate counting',()=>{
 const first=instagram(),daily=buildDailyLedger({date,receipt:first}),initial=reconcile(campaign(),daily,first);
 const later=instagram({receiptEvidence:{...first.receiptEvidence,observedAt:date+'T12:32:00+08:00',screenshotSha256:hash('second synthetic Instagram screenshot')}});
 const nextDaily=buildDailyLedger({date,existing:daily,receipt:later}),next=reconcile(initial.campaign,nextDaily,later);
 assert.equal(nextDaily.confirmedCount,1);assert.equal(next.campaign.confirmedCount,1);
 assert.equal(nextDaily.records[0].receiptEvidenceHistory.length,2);assert.equal(next.campaign.records[0].receiptEvidenceHistory.length,2);
 assert.equal(next.continuation.lastReceiptId,verifiedReceiptKey(first));assert.equal(initial.campaign.records[0].receiptEvidenceHistory,undefined);
 const repeated=reconcile(next.campaign,nextDaily,later);assert.deepEqual(repeated.campaign.records[0].receiptEvidenceHistory,next.campaign.records[0].receiptEvidenceHistory);
});
test('Instagram cannot recount an email or LinkedIn company group or an already-used Instagram profile',()=>{
 const row=instagram();
 for(const first of [email({group:'Fixture Group'}),social()]){
  const daily=buildDailyLedger({date,receipt:first}),prior=reconcile(campaign(),daily,first).campaign;
  assert.throws(()=>buildDailyLedger({date,existing:daily,receipt:row}),/Company\/group/);
  assert.throws(()=>reconcile(prior,buildDailyLedger({date,receipt:row}),row),/Company\/group/);
 }
 const daily=buildDailyLedger({date,receipt:row}),prior=reconcile(campaign(),daily,row).campaign;
 const renamed=instagram({company:'Another synthetic Instagram label',group:undefined,aliases:[],sentAtLocal:date+'T12:30:10+08:00'});
 assert.throws(()=>buildDailyLedger({date,existing:daily,receipt:renamed}),/Company\/group/);
 assert.throws(()=>reconcile(prior,buildDailyLedger({date,receipt:renamed}),renamed),/Company\/group/);
 const excluded=campaign();excluded.excludedReceipts=[email({group:'Fixture Group',countAsNewCustomer:false,deliveryStatus:'hard_bounced'})];
 assert.throws(()=>reconcile(excluded,buildDailyLedger({date,receipt:row}),row),/Company\/group/);
});
test('typed Instagram private-source synchronization is idempotent and enforces exact task/channel pairing',()=>{
 const row=instagram(),source={...row,task_id:'verified-social-instagram-synthetic-'+date,icpScore:row.icp,timestamp:row.sentAtLocal};
 assert.deepEqual(missingVerifiedReceipts([source],[]),[source]);assert.deepEqual(missingVerifiedReceipts([source],[source]),[]);
 assert.deepEqual(missingVerifiedReceipts([source],[{channel:'instagram',status:'sent_confirmed',receiptKey:verifiedReceiptKey(source)}]),[source]);
 for(const wrong of [{...source,channel:'linkedin'},{...source,channel:'email',mailId:'1_0:synthetic'},
  {...source,task_id:'verified-social-linkedin-synthetic-'+date}, {...source,task_id:'verified-email-synthetic-'+date}])
  assert.throws(()=>missingVerifiedReceipts([wrong],[]),/task\/channel mismatch/);
 assert.throws(()=>missingVerifiedReceipts([source],[{...source,receiptEvidence:{...source.receiptEvidence,outgoingVisible:false}}]));
});
test('Instagram unknown outcomes, threshold failures and poisoned histories remain uncountable',()=>{
 const row=instagram(),badHistory={...row,receiptEvidenceHistory:[{...row.receiptEvidence,conversationUrl:'https://www.instagram.com/direct/t/900000000000000000002/'}]};
 for(const bad of [instagram({status:'send_unconfirmed'}),instagram({status:'draft'}),instagram({icp:70}),instagram({countAsNewCustomer:false}),badHistory])
  assert.throws(()=>buildDailyLedger({date,receipt:bad}));
 assert.throws(()=>reconcile(campaign(),buildDailyLedger({date,receipt:row}),badHistory));
});
