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
const instagram=(patch={},evidencePatch={})=>social({
  company:'Synthetic Instagram business',channel:'instagram',
  target_url:'https://www.instagram.com/synthetic_business/',...patch
},{channel:'instagram',senderProfileUrl:'https://www.instagram.com/synthetic.sender_ig/',
  recipientProfileUrl:'https://www.instagram.com/synthetic_business/',
  conversationUrl:'https://www.instagram.com/direct/t/17800000000000001/',...evidencePatch});

test('preserves the existing email ID precedence and optional email channel',()=>{
  assert.equal(verifiedReceiptKey({mailId:'1_0:synthetic'}),'1_0:synthetic');
  assert.equal(verifiedReceiptKey({channel:'email',messageId:'1_0:synthetic'}),'1_0:synthetic');
  assert.equal(verifiedReceiptKey({mailId:'1_0:first',messageId:'1_0:second'}),'1_0:first');
  reject({mailId:'5_0:synthetic-draft'});
  reject({mailId:'5_0:synthetic-draft',messageId:'1_0:second'});
});

test('the original LinkedIn fixture hash and company identity remain byte-compatible',()=>{
  assert.equal(verifiedReceiptKey(social()),
    'linkedin-evidence-sha256:9ae45fea36eb64566d61b0f12ac4b02261c66d501ca910cb7b4b18bc83967c8a');
  assert.equal(verifiedSocialCompanyIdentity(social()),
    'official-social-company:https://www.linkedin.com/company/synthetic-fixture-company/');
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

test('Instagram has an independent typed local key without inventing provider IDs',()=>{
  const row=instagram(),before=structuredClone(row);
  const key=verifiedReceiptKey(row);
  assert.match(key,/^instagram-evidence-sha256:[a-f\d]{64}$/);
  assert.deepEqual(row,before);
  assert.equal(row.providerMessageId,null);
  const absent=instagram();delete absent.providerMessageId;
  assert.equal(verifiedReceiptKey(absent),key);
  assert.equal(Object.hasOwn(absent,'providerMessageId'),false);
  assert.notEqual(verifiedReceiptKey(instagram({}, {
    conversationUrl:'https://www.instagram.com/direct/t/17800000000000002/'})),key,
  'large numeric thread IDs stay exact strings, never rounded JS numbers');
});

test('Instagram canonicalizes public handle identity without merging different businesses',()=>{
  const row=instagram(),key=verifiedReceiptKey(row);
  const tracked=instagram({company:'Synthetic alias',sentAtLocal:'2026-10-25T05:00:00Z',
    target_url:'https://instagram.com/SYNTHETIC_BUSINESS?igsh=fixture'}, {
    senderProfileUrl:'https://instagram.com/SYNTHETIC.SENDER_IG?igsh=fixture',
    recipientProfileUrl:'https://instagram.com/SYNTHETIC_BUSINESS#fixture',
    conversationUrl:'https://instagram.com/direct/t/17800000000000001?igsh=fixture'});
  assert.equal(verifiedReceiptKey(tracked),key);
  assert.equal(verifiedSocialCompanyIdentity(row),'instagram-business:synthetic_business');
  assert.equal(verifiedSocialCompanyIdentity(tracked),verifiedSocialCompanyIdentity(row));
  const other=instagram({target_url:'https://instagram.com/another_business/'}, {
    recipientProfileUrl:'https://instagram.com/another_business/'});
  assert.notEqual(verifiedSocialCompanyIdentity(other),verifiedSocialCompanyIdentity(row));
  assert.notEqual(verifiedReceiptKey(other),key);
  assert.equal(verifiedSocialCompanyIdentity({channel:'email',officialSocialUrl:row.target_url}),null);
});

test('Instagram rejects unsafe hosts, schemes, credentials, ports and nonliteral paths',()=>{
  for(const senderProfileUrl of [
    'https://instagram.com.evil.invalid/synthetic_sender/',
    'https://instagram.com@evil.invalid/synthetic_sender/',
    'https://evil.invalid@instagram.com/synthetic_sender/',
    'http://www.instagram.com/synthetic_sender/',
    'https://www.instagram.com:443/synthetic_sender/',
    'https://www.instagram.com:8443/synthetic_sender/',
    'https://www.instagram.com./synthetic_sender/',
    'https://m.instagram.com/synthetic_sender/',
    'https://%69nstagram.com/synthetic_sender/',
    'https://www.instagram.com\\@evil.invalid/synthetic_sender/',
    'https://www.instagram.com/p/../synthetic_sender/',
    'https://www.instagram.com/%2e%2e/synthetic_sender/',
    ' https://www.instagram.com/synthetic_sender/',
    'https://www.instagram.com/synthetic_sender/\u0000'
  ])reject(instagram({}, {senderProfileUrl}),senderProfileUrl);
});

test('Instagram accepts only supported single handles and never reserved application routes',()=>{
  for(const handle of ['accounts','direct','explore','p','reel','reels','stories','tv','about',
    'api','graphql','challenge','login','legal','directory','web','developer','oauth','accounts/login',
    '', '.', '..', '.synthetic','synthetic.','synthetic..business','synthetic-business',
    'synthetic%2fbusiness','synthetic%5cbusiness','synthetic business','a'.repeat(31),'synthetic\u00e9']) {
    reject(instagram({}, {senderProfileUrl:`https://www.instagram.com/${handle}/`}),handle);
    reject(instagram({}, {recipientProfileUrl:`https://www.instagram.com/${handle}/`}),handle);
  }
  assert.match(verifiedReceiptKey(instagram({}, {senderProfileUrl:'https://instagram.com/_synthetic.1/'})),/^instagram-evidence-sha256:/);
});

test('Instagram requires the exact numeric direct thread, never posts, reels, profiles or inbox',()=>{
  for(const conversationUrl of [
    'https://www.instagram.com/synthetic_business/',
    'https://www.instagram.com/p/17800000000000001/',
    'https://www.instagram.com/reel/17800000000000001/',
    'https://www.instagram.com/direct/',
    'https://www.instagram.com/direct/inbox/',
    'https://www.instagram.com/direct/?thread=17800000000000001',
    'https://www.instagram.com/direct/t/',
    'https://www.instagram.com/direct/t/abc/',
    'https://www.instagram.com/direct/t/17800000000000001/another/',
    'https://www.instagram.com/direct/t/%31/',
    'https://www.instagram.com/direct/t/0/',
    'https://www.instagram.com/direct/t/0001/',
    'https://www.instagram.com/direct/x/../t/17800000000000001/'
  ])reject(instagram({}, {conversationUrl}),conversationUrl);
});

test('Instagram retains every independently observed sender, recipient and reopening gate',()=>{
  for(const field of ['independentlyReopened','outgoingVisible','senderVerified','recipientVerified'])
    for(const value of [undefined,false,'true',1])reject(instagram({}, {[field]:value}),field);
  for(const field of ['senderProfileUrl','recipientProfileUrl','conversationUrl'])
    reject(instagram({}, {[field]:undefined}),field);
  assert.throws(()=>verifiedSocialCompanyIdentity(instagram({}, {outgoingVisible:false})));
});

test('Instagram requires exact text, screenshot SHA, valid time and outgoing message state',()=>{
  for(const body of [undefined,null,'','   ','Changed synthetic body'])reject(instagram({}, {body}));
  for(const field of ['bodySha256','screenshotSha256'])
    for(const value of [undefined,null,'','a'.repeat(63),'g'.repeat(64)])reject(instagram({}, {[field]:value}),field);
  for(const observedAt of [undefined,null,'invalid','2026-10-25T12:59:59+08:00'])reject(instagram({}, {observedAt}));
  reject(instagram({sentAtLocal:undefined}));
  for(const status of [undefined,'draft','unknown','prepared_not_sent','send_unconfirmed'])reject(instagram({status}));
  for(const action of ['follow','invitation_sent','draft','website_form','submitted_confirmed']) {
    reject(instagram({action}));reject(instagram({}, {action}));
  }
  for(const field of ['mailId','messageId','providerMessageId'])reject(instagram({[field]:'1_0:synthetic-email'}),field);
});

test('Instagram opening a chat, profile or Message button is never a sent receipt',()=>{
  for(const action of ['chat_opened','conversation_opened','message_window_opened','profile_opened',
    'message_button_clicked','chat_ready','CHAT_OPENED']) {
    for(const field of ['action','type','eventType']) {
      reject(instagram({[field]:action}));reject(instagram({}, {[field]:action}));
    }
    reject(instagram({}, {status:action}));
  }
});

test('Instagram rejects cross-channel URLs, evidence and receipt keys',()=>{
  reject(instagram({}, {channel:'linkedin'}));
  reject(social({}, {channel:'instagram'}));
  reject(instagram({}, {senderProfileUrl:social().receiptEvidence.senderProfileUrl}));
  reject(instagram({}, {recipientProfileUrl:social().receiptEvidence.recipientProfileUrl}));
  reject(instagram({}, {conversationUrl:social().receiptEvidence.conversationUrl}));
  reject(social({}, {conversationUrl:instagram().receiptEvidence.conversationUrl}));
  reject({channel:'email',mailId:'1_0:synthetic',receiptEvidence:{channel:'instagram'}});
  reject(instagram({receiptKey:verifiedReceiptKey(social())}));
  reject(social({receiptKey:'instagram-evidence-sha256:'+hash('synthetic')}));
});

test('Instagram binds the exact business target and cannot count a self message',()=>{
  reject(instagram({target_url:'https://instagram.com/another_business/'}));
  reject(instagram({target_url:undefined,source:'https://synthetic-company.invalid/'}));
  reject(instagram({}, {senderProfileUrl:'https://instagram.com/synthetic_business/'}));
  assert.equal(verifiedReceiptKey(instagram({target_url:undefined,
    officialSocialUrl:'https://instagram.com/synthetic_business?igsh=fixture'})),verifiedReceiptKey(instagram()));
  assert.equal(verifiedReceiptKey(instagram({target_url:undefined,
    source:'https://instagram.com/synthetic_business/'})),verifiedReceiptKey(instagram()));
});

test('Instagram observations merge proof without changing the sent message identity',()=>{
  const first=instagram(),key=verifiedReceiptKey(first),before=structuredClone(first);
  const later=instagram({}, {observedAt:'2026-10-25T13:02:00+08:00',screenshotSha256:hash('later synthetic Instagram screenshot')});
  const merged=mergeVerifiedReceiptObservations(first,later);
  assert.equal(verifiedReceiptKey(merged),key);
  assert.equal(merged.receiptEvidence.screenshotSha256,later.receiptEvidence.screenshotSha256);
  assert.deepEqual(merged.receiptEvidenceHistory.map(e=>e.screenshotSha256),
    [first.receiptEvidence.screenshotSha256,later.receiptEvidence.screenshotSha256]);
  assert.deepEqual(mergeVerifiedReceiptObservations(merged,first),merged);
  assert.deepEqual(mergeVerifiedReceiptObservations(merged,later),merged);
  assert.deepEqual(first,before);
  reject({...first,receiptEvidenceHistory:[{...first.receiptEvidence,
    conversationUrl:'https://www.instagram.com/direct/t/17800000000000002/'}]});
  reject({...first,receiptEvidenceHistory:[{...first.receiptEvidence,body:'Altered',bodySha256:hash('Altered')}]});
  assert.throws(()=>mergeVerifiedReceiptObservations(first,social()));
});
