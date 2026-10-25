import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifiedReceiptKey,verifiedSocialCompanyIdentity,mergeVerifiedReceiptObservations} from '../scripts/channel-receipt-state.mjs';

// All identities, timestamps, text and hashes below are SYNTHETIC fixtures.
// Passing these tests proves the contract, not that any outreach occurred.
const hash=value=>createHash('sha256').update(value,'utf8').digest('hex');
const social=(patch={},evidencePatch={})=>({
  company:'Synthetic fixture company',channel:'linkedin',status:'sent_confirmed',
  target_url:'https://www.linkedin.com/company/synthetic-fixture-company/',
  sentAtLocal:'2026-10-25T13:00:00+08:00',providerMessageId:null,
  receiptEvidence:{channel:'linkedin',
    senderProfileUrl:'https://www.linkedin.com/in/synthetic-sender/',
    recipientProfileUrl:'https://www.linkedin.com/company/synthetic-fixture-company/',
    conversationUrl:'https://www.linkedin.com/messaging/thread/SYNTHETIC_THREAD_1/',
    body:'Synthetic fixture message, never sent.',
    bodySha256:hash('Synthetic fixture message, never sent.'),
    independentlyReopened:true,outgoingVisible:true,senderVerified:true,recipientVerified:true,
    observedAt:'2026-10-25T13:01:00+08:00',screenshotSha256:hash('synthetic screenshot bytes'),
    ...evidencePatch},...patch
});
const reject=(row,label)=>assert.throws(()=>verifiedReceiptKey(row),/Unverified channel receipt/,label);

test('preserves the existing email ID precedence and optional email channel',()=>{
  assert.equal(verifiedReceiptKey({mailId:'1_0:synthetic'}),'1_0:synthetic');
  assert.equal(verifiedReceiptKey({channel:'email',messageId:'1_0:synthetic'}),'1_0:synthetic');
  assert.equal(verifiedReceiptKey({mailId:'1_0:first',messageId:'1_0:second'}),'1_0:first');
  reject({mailId:'5_0:synthetic-draft'});
  reject({mailId:'5_0:synthetic-draft',messageId:'1_0:second'});
});

test('accepts a fully structured synthetic LinkedIn message without inventing provider IDs',()=>{
  const row=social(),before=structuredClone(row);
  assert.match(verifiedReceiptKey(row),/^linkedin-evidence-sha256:[a-f\d]{64}$/);
  assert.deepEqual(row,before);
  assert.equal(row.providerMessageId,null);
  const absent=social();delete absent.providerMessageId;
  assert.equal(verifiedReceiptKey(absent),verifiedReceiptKey(row));
  assert.equal(Object.hasOwn(absent,'providerMessageId'),false);
});

test('rejects unsupported, invitation, follow, accepted, draft and uncertain channels or states',()=>{
  for(const channel of [null,'','facebook','instagram','website_form','linkedin_invitation','linkedin_follow'])reject(social({channel}),String(channel));
  for(const status of [undefined,null,'invite_sent','invitation_sent','followed','accepted','send_unconfirmed','unknown','draft','prepared_not_sent'])reject(social({status}),String(status));
  reject(social({receiptEvidence:undefined}));
  reject(social({receiptEvidence:[]}));
});

test('rejects email IDs disguised as social receipts and mismatched evidence channels',()=>{
  for(const field of ['mailId','messageId','providerMessageId']){
    reject(social({[field]:'1_0:synthetic'}),field);
    reject(social({[field]:'5_0:synthetic-draft'}),field);
  }
  reject(social({}, {channel:'email'}));
  reject({channel:'email',mailId:'1_0:synthetic',receiptEvidence:{channel:'linkedin'}});
  reject({mailId:'1_0:synthetic',receiptEvidence:{channel:'linkedin'}});
});

test('does not relabel machine-marked invitations, follows or forms as messages',()=>{
  for(const action of ['invite','invitation_sent','connection_request','follow','accepted','draft','unknown','website_form','submitted_confirmed']){
    reject(social({action}),action);
    reject(social({}, {action}),action);
    reject(social({type:action}),action);
    reject(social({}, {type:action}),action);
  }
});

test('requires every independently observed sender, recipient and reopening flag',()=>{
  for(const field of ['independentlyReopened','outgoingVisible','senderVerified','recipientVerified']){
    for(const value of [undefined,false,'true',1])reject(social({}, {[field]:value}),field);
  }
  for(const field of ['senderProfileUrl','recipientProfileUrl','conversationUrl'])reject(social({}, {[field]:undefined}),field);
});

test('requires exact message text, a matching body hash and an immutable screenshot hash',()=>{
  for(const body of [undefined,null,'','   '])reject(social({}, {body}));
  reject(social({}, {body:'Different synthetic text'}));
  for(const field of ['bodySha256','screenshotSha256']){
    for(const value of [undefined,null,'','a'.repeat(63),'g'.repeat(64),'sha256:'+hash('x')])reject(social({}, {[field]:value}),field);
  }
  assert.equal(verifiedReceiptKey(social({}, {bodySha256:hash('Synthetic fixture message, never sent.').toUpperCase()})),verifiedReceiptKey(social()));
});

test('requires an actual sent timestamp and an observation no earlier than sending',()=>{
  for(const sentAtLocal of [undefined,null,'','invalid',NaN])reject(social({sentAtLocal}));
  for(const observedAt of [undefined,null,'','invalid','2026-10-25T12:59:59+08:00'])reject(social({}, {observedAt}));
  assert.equal(verifiedReceiptKey(social({}, {observedAt:'2026-10-25T13:00:00+08:00'})),verifiedReceiptKey(social()));
  const timestamp=social({sentAtLocal:undefined,timestamp:'2026-10-25T05:00:00Z'});
  assert.equal(verifiedReceiptKey(timestamp),verifiedReceiptKey(social()));
});

test('rejects unsafe URL hosts, userinfo, non-HTTPS, ports and malformed paths',()=>{
  const badUrls=[
    'https://linkedin.com.evil.invalid/in/synthetic-sender/',
    'https://linkedin.com@evil.invalid/in/synthetic-sender/',
    'https://evil.invalid@linkedin.com/in/synthetic-sender/',
    'http://www.linkedin.com/in/synthetic-sender/',
    'https://www.linkedin.com:8443/in/synthetic-sender/',
    'https://www.linkedin.com./in/synthetic-sender/',
    'https://m.linkedin.com/in/synthetic-sender/',
    'https://www.linkedin.com\\@evil.invalid/in/synthetic-sender/',
    'https://www.linkedin.com/in/%2e%2e/synthetic-sender/',
    'https://www.linkedin.com/in/synthetic sender/',
    ' https://www.linkedin.com/in/synthetic-sender/',
    'https://www.linkedin.com/company/synthetic-sender/'
  ];
  for(const senderProfileUrl of badUrls)reject(social({}, {senderProfileUrl}),senderProfileUrl);
  reject(social({}, {recipientProfileUrl:'https://www.linkedin.com/in/synthetic-fixture-company/'}));
});

test('requires a real nonempty messaging thread path, never a profile or query-only thread',()=>{
  for(const conversationUrl of [
    'https://www.linkedin.com/company/synthetic-fixture-company/',
    'https://www.linkedin.com/messaging/',
    'https://www.linkedin.com/messaging/?thread=SYNTHETIC_THREAD_1',
    'https://www.linkedin.com/messaging/thread/',
    'https://www.linkedin.com/messaging/thread/?id=SYNTHETIC_THREAD_1',
    'https://www.linkedin.com/messaging/thread/one/two/',
    'https://www.linkedin.com/messaging/thread/%2F/'
  ])reject(social({}, {conversationUrl}),conversationUrl);
});

test('matches the exact company social URL rather than any arbitrary source or a lookalike',()=>{
  reject(social({target_url:'https://www.linkedin.com/company/another-synthetic-company/'}));
  reject(social({target_url:'https://linkedin.com.evil.invalid/company/synthetic-fixture-company/'}));
  reject(social({target_url:undefined,source:'https://synthetic-company.invalid/'}));
  const official=social({target_url:undefined,officialSocialUrl:'https://linkedin.com/company/synthetic-fixture-company'});
  assert.equal(verifiedReceiptKey(official),verifiedReceiptKey(social()));
  const source=social({target_url:undefined,source:'https://www.linkedin.com/company/synthetic-fixture-company/'});
  assert.equal(verifiedReceiptKey(source),verifiedReceiptKey(social()));
});

test('local evidence keys are stable under URL tracking and equivalent timestamp representations',()=>{
  const row=social(),key=verifiedReceiptKey(row);
  const tracked=social({sentAtLocal:'2026-10-25T05:00:00.000Z'}, {
    senderProfileUrl:'https://linkedin.com/in/synthetic-sender?trk=fixture',
    recipientProfileUrl:'https://linkedin.com/company/synthetic-fixture-company?trk=fixture#about',
    conversationUrl:'https://linkedin.com/messaging/thread/SYNTHETIC_THREAD_1?trk=fixture'
  });
  assert.equal(verifiedReceiptKey(tracked),key);
  assert.equal(verifiedReceiptKey({...row,receiptKey:key}),key);
  reject({...row,receiptKey:'linkedin-evidence-sha256:'+hash('unrelated fixture')});
});

test('distinct messages in one thread cannot collapse onto the same local evidence key',()=>{
  const key=verifiedReceiptKey(social());
  const body='Another synthetic fixture message, never sent.';
  assert.notEqual(verifiedReceiptKey(social({}, {body,bodySha256:hash(body)})),key);
  assert.notEqual(verifiedReceiptKey(social({sentAtLocal:'2026-10-25T13:00:01+08:00'})),key);
});

test('rejects missing or non-record input without mutating it',()=>{
  for(const value of [undefined,null,[],1,'synthetic'])reject(value);
  const row=social({}, {outgoingVisible:false}),before=structuredClone(row);
  reject(row);assert.deepEqual(row,before);
});

test('verified LinkedIn company identity is canonical across display names, not shared-host identity',()=>{
  const one=social(),two=social({company:'Another synthetic display label'}, {
    recipientProfileUrl:'https://linkedin.com/company/synthetic-fixture-company?trk=fixture'});
  assert.equal(verifiedSocialCompanyIdentity(one),verifiedSocialCompanyIdentity(two));
  assert.equal(verifiedSocialCompanyIdentity({channel:'email',officialSocialUrl:one.target_url}),null);
  assert.throws(()=>verifiedSocialCompanyIdentity(social({}, {outgoingVisible:false})));
});

test('a new independent observation preserves old proof and cannot change the actual message identity',()=>{
  const first=social(),later=social({}, {observedAt:'2026-10-25T13:02:00+08:00',screenshotSha256:hash('later synthetic screenshot')});
  const before=structuredClone(first),merged=mergeVerifiedReceiptObservations(first,later);
  assert.equal(verifiedReceiptKey(merged),verifiedReceiptKey(first));
  assert.equal(merged.receiptEvidence.screenshotSha256,later.receiptEvidence.screenshotSha256);
  assert.deepEqual(merged.receiptEvidenceHistory.map(e=>e.screenshotSha256),
    [first.receiptEvidence.screenshotSha256,later.receiptEvidence.screenshotSha256]);
  assert.deepEqual(first,before);
  assert.deepEqual(mergeVerifiedReceiptObservations(merged,later),merged);
  assert.deepEqual(mergeVerifiedReceiptObservations(merged,first),merged);
  const badHistory=social({receiptEvidenceHistory:[{...first.receiptEvidence,body:'Changed synthetic body'}]});
  assert.throws(()=>mergeVerifiedReceiptObservations(first,badHistory));
  assert.throws(()=>mergeVerifiedReceiptObservations(first,social({sentAtLocal:'2026-10-25T13:00:01+08:00'})));
});

test('first ingestion rejects unverified or cross-message observation history',()=>{
  const row=social(),original=row.receiptEvidence;
  for(const receiptEvidenceHistory of [{},[undefined],[{...original,outgoingVisible:false}],
    [{...original,screenshotSha256:'not-a-hash'}],
    [{...original,observedAt:'2026-10-25T12:59:00+08:00'}],
    [{...original,body:'Another synthetic message.',bodySha256:hash('Another synthetic message.')}],
    [{...original,senderProfileUrl:'https://www.linkedin.com/in/another-synthetic-sender/'}],
    [{...original,conversationUrl:'https://www.linkedin.com/messaging/thread/ANOTHER_SYNTHETIC_THREAD/'}]]){
    reject({...row,receiptEvidenceHistory});
  }
  assert.equal(verifiedReceiptKey({...row,receiptEvidenceHistory:[original]}),verifiedReceiptKey(row));
});
