import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCampaignCheckpoint} from '../scripts/campaign-checkpoint-state.mjs';

// Every row, address, message ID and synchronization proof here is synthetic.
// These fixtures are never browser evidence, real sends or remote-sync proofs.
const DATE='2026-10-24';
const VERIFIED_AT='2026-10-24T05:00:00Z';
const CAMPAIGN_ID='synthetic-checkpoint-campaign';
const SOURCE_SHA='a'.repeat(40);
const GITHUB_SHA='b'.repeat(40);
const clone=value=>structuredClone(value);

function receipt(n,{date=DATE,time='08:00',...extra}={}){
 return{company:`Synthetic Customer ${n}`,group:`Synthetic Group ${n}`,
  aliases:[`Synthetic Customer ${n}`,`synthetic-${n}.test`],
  country:'Singapore',publicBusinessEmail:`business@synthetic-${n}.test`,
  channel:'email',status:'sent_confirmed',icp:70.4,
  mailId:`1_0:synthetic-checkpoint-${n}`,sentAtLocal:`${date}T${time}:00+08:00`,
  executionDate:date,batchDate:date,source:`https://synthetic-${n}.test/contact`,
  confirmationEvidence:'Synthetic unit-test string; not a Sent confirmation.',
  ...extra};
}

function fixture({total=70,prior=40,synced=true,includeNew=true}={}){
 const records=Array.from({length:total},(_,i)=>receipt(i,i<prior?
  {date:'2026-10-23',time:`09:${String(i).padStart(2,'0')}`}:
  {time:`08:${String(i-prior).padStart(2,'0')}`}));
 const next=receipt(total,{time:'12:31'});
 const today=records.filter(row=>row.executionDate===DATE);
 const excluded=[receipt(900,{countAsNewCustomer:false,
  newCustomerDevelopmentStatus:'excluded_hard_bounce',doNotResend:true})];
 const oldSync={verified:true,proof:'synthetic-old-sync-proof.json',source:SOURCE_SHA,
  siteDeployment:'synthetic-old-deployment',siteVersion:210,github:GITHUB_SHA,
  latestLocalCountsPending:false};
 const campaign={id:CAMPAIGN_ID,startedAt:'2026-10-19T13:50:54Z',timezone:'Asia/Shanghai',
  target:500,confirmedCount:records.length,remaining:500-records.length,records,
  excludedReceipts:excluded,objective:'Synthetic regression objective',
  userMetadata:{records:[{keep:'nested user record'}],confirmedCount:999},
  privateData:true,publicGitHubUploadAllowed:false,
  execution:{status:'running',unattendedHostVerified:false,executionConnected:false,
   userAuditNote:'preserve audit metadata',
   latestAudit:{confirmedCount:42,remaining:458,confirmedToday:2,proof:'synthetic-old-audit.json'},
   ...(synced?{latestSynchronization:{...oldSync,privateSourceSha:SOURCE_SHA,
    githubSha:GITHUB_SHA,dataDate:DATE}}:{})}};
 const dayRecords=includeNew?[...clone(today),clone(next)]:clone(today);
 const daily={date:DATE,timezone:'Asia/Shanghai',target:100,
  confirmedCount:dayRecords.length,remaining:Math.max(0,100-dayRecords.length),
  records:dayRecords,excludedReceipts:clone(excluded),userNote:'daily metadata'};
 const continuation={date:DATE,timezone:'Asia/Shanghai',campaignId:CAMPAIGN_ID,
  status:'ready_to_continue',goalStatus:'active',target:500,confirmedCount:65,
  remaining:435,confirmedToday:25,dailyTarget:100,dailyRemaining:75,
  lastReceiptId:'1_0:synthetic-old-checkpoint',verifiedAt:'2026-10-24T00:00:00Z',
  userMetadata:{records:[{keep:'continuation note'}],remaining:123},
  browserEvidence:{unattendedHostVerified:false,executionConnected:false},
  ...(synced?{synchronization:clone(oldSync)}:{})};
 return{campaign,daily,continuation,receipt:next,verifiedAt:VERIFIED_AT};
}

function assertCounts(result,count,today){
 assert.equal(result.campaign.records.length,count);
 assert.equal(result.campaign.confirmedCount,count);
 assert.equal(result.campaign.remaining,500-count);
 assert.equal(result.continuation.confirmedCount,count);
 assert.equal(result.continuation.remaining,500-count);
 assert.equal(result.continuation.confirmedToday,today);
 assert.equal(result.continuation.dailyRemaining,Math.max(0,100-today));
 assert.equal(result.campaign.execution.latestAudit.confirmedCount,count);
 assert.equal(result.campaign.execution.latestAudit.confirmedToday,today);
 assert.equal(result.campaign.execution.latestAudit.remaining,500-count);
}

test('valid confirmed receipt appends once and all campaign/day checkpoint counters agree',()=>{
 const input=fixture(),result=buildCampaignCheckpoint(input);
 assertCounts(result,71,31);
 assert.deepEqual(result.campaign.records.at(-1),input.receipt);
 assert.equal(result.continuation.lastReceiptId,input.receipt.mailId);
 assert.equal(result.continuation.goalStatus,'active');
 assert.equal(result.campaign.target,500);
 assert.equal(result.continuation.target,500);
});

test('identical already-recorded message ID reconciles stale continuation idempotently',()=>{
 const input=fixture({includeNew:false});
 input.receipt=clone(input.campaign.records.at(-1));
 const first=buildCampaignCheckpoint(input);
 assertCounts(first,70,30);
 assert.deepEqual(first.campaign.records,input.campaign.records);
 const again=buildCampaignCheckpoint({...input,campaign:first.campaign,continuation:first.continuation});
 assert.deepEqual(again,first);
});

test('same message ID with conflicting identity,recipient,time,score or receipt data throws',()=>{
 for(const mutation of [{company:'Conflicting company'},
  {group:'Conflicting group'},{publicBusinessEmail:'changed@synthetic.test'},
  {sentAtLocal:`${DATE}T08:59:00+08:00`},{icp:71.4},
  {confirmationEvidence:'Conflicting confirmation text'}]){
  const input=fixture({includeNew:false});
  input.receipt={...clone(input.campaign.records.at(-1)),...mutation};
  assert.throws(()=>buildCampaignCheckpoint(input),JSON.stringify(mutation));
 }
});

test('different-ID company,group and shared-company-alias duplicates are rejected',()=>{
 for(const kind of ['company','group','alias']){
  const input=fixture(),old=input.campaign.records[0];
  if(kind==='company')input.receipt.company=old.company;
  if(kind==='group')input.receipt.group=old.group;
  if(kind==='alias')input.receipt.aliases=[...input.receipt.aliases,old.aliases[1]];
  input.daily.records[input.daily.records.length-1]=clone(input.receipt);
  assert.throws(()=>buildCampaignCheckpoint(input),kind);
 }
});

test('excluded receipt,company or group cannot be revived as a new valid customer',()=>{
 for(const kind of ['id','company','group']){
  const input=fixture(),excluded=input.campaign.excludedReceipts[0];
  if(kind==='id')input.receipt.mailId=excluded.mailId;
  if(kind==='company')input.receipt.company=excluded.company;
  if(kind==='group')input.receipt.group=excluded.group;
  input.daily.records[input.daily.records.length-1]=clone(input.receipt);
  assert.throws(()=>buildCampaignCheckpoint(input),kind);
 }
});

test('unknown/prepared/draft,nonexclusive ICP threshold and unknown country never qualify',()=>{
 for(const mutation of [{status:'send_unconfirmed'},{status:'prepared_not_sent'},
  {mailId:'5_0:synthetic-draft'},{mailId:'2_0:synthetic-inbox'},
  {icp:70},{icp:69.9},{icp:null},{country:''},{country:'unknown'},
  {country:'Global / Unspecified'},{countAsNewCustomer:false}]){
  const input=fixture();Object.assign(input.receipt,mutation);
  input.daily.records[input.daily.records.length-1]=clone(input.receipt);
  assert.throws(()=>buildCampaignCheckpoint(input),JSON.stringify(mutation));
 }
});

test('known delivery or development exclusions fail closed without redundant flags',()=>{
 for(const mutation of [{deliveryStatus:'hard_bounced'},
  {newCustomerDevelopmentStatus:'excluded_hard_bounce'},
  {newCustomerDevelopmentStatus:'excluded_prior_group_contact'}]){
  const input=fixture();Object.assign(input.receipt,mutation);
  input.daily.records[input.daily.records.length-1]=clone(input.receipt);
  const before=clone(input);
  assert.throws(()=>buildCampaignCheckpoint(input),JSON.stringify(mutation));
  assert.deepEqual(input,before,'preserve Sent and source evidence');
  const existing=fixture({includeNew:false});existing.receipt=null;
  Object.assign(existing.campaign.records.at(-1),mutation);
  Object.assign(existing.daily.records.at(-1),mutation);
  assert.throws(()=>buildCampaignCheckpoint(existing),'existing active failed receipt requires explicit correction');
 }
});

test('Sent with unconfirmed delivery remains countable without claiming delivery',()=>{
 const input=fixture();input.receipt.deliveryStatus='not independently confirmed; sent-folder confirmation only';
 input.daily.records[input.daily.records.length-1]=clone(input.receipt);
 assertCounts(buildCampaignCheckpoint(input),71,31);
});

test('invalid real dates,date/time disagreement and pre-campaign receipts throw',()=>{
 for(const mutation of [{sentAtLocal:'not a timestamp'},
  {sentAtLocal:'2026-10-32T12:31:00+08:00',executionDate:'2026-10-32',batchDate:'2026-10-32'},
  {sentAtLocal:`${DATE}T25:00:00+08:00`},
  {executionDate:'2026-10-23'},
  {sentAtLocal:'2026-10-19T21:49:00+08:00',executionDate:'2026-10-19',batchDate:'2026-10-19'}]){
  const input=fixture();Object.assign(input.receipt,mutation);
  input.daily.records[input.daily.records.length-1]=clone(input.receipt);
  assert.throws(()=>buildCampaignCheckpoint(input),JSON.stringify(mutation));
 }
 const invalidStart=fixture();invalidStart.campaign.startedAt='not a campaign start';
 assert.throws(()=>buildCampaignCheckpoint(invalidStart));
});

test('campaign counter or remaining drift is rejected rather than silently legitimized',()=>{
 for(const mutation of [{confirmedCount:69},{confirmedCount:71},{remaining:400}]){
  const input=fixture();Object.assign(input.campaign,mutation);
  assert.throws(()=>buildCampaignCheckpoint(input),JSON.stringify(mutation));
 }
});

test('daily campaign subset must be complete,matching and confined to its actual day',()=>{
 for(const kind of ['missing','conflict','cross-day','daily-count']){
  const input=fixture();
  if(kind==='missing')input.daily.records.shift();
  if(kind==='conflict')input.daily.records[0].publicBusinessEmail='conflict@synthetic.test';
  if(kind==='cross-day')input.daily.records.push(clone(input.campaign.records[0]));
  if(kind!=='daily-count'){
   input.daily.confirmedCount=input.daily.records.length;
   input.daily.remaining=100-input.daily.records.length;
  }else input.daily.confirmedCount++;
  assert.throws(()=>buildCampaignCheckpoint(input),kind);
 }
});

test('pure reconciliation preserves metadata/exclusions,does not claim host capability and picks latest receipt',()=>{
 const input=fixture({synced:false});
 input.receipt.sentAtLocal=`${DATE}T07:00:00+08:00`;
 input.daily.records[input.daily.records.length-1]=clone(input.receipt);
 const before=clone(input),result=buildCampaignCheckpoint(input);
 assert.deepEqual(input,before,'pure function must not mutate caller-owned evidence');
 assert.deepEqual(result.campaign.excludedReceipts,before.campaign.excludedReceipts);
 assert.deepEqual(result.campaign.userMetadata,before.campaign.userMetadata);
 assert.deepEqual(result.continuation.userMetadata,before.continuation.userMetadata);
 assert.equal(result.campaign.objective,before.campaign.objective);
 assert.equal(result.campaign.execution.userAuditNote,'preserve audit metadata');
 assert.equal(result.campaign.execution.unattendedHostVerified,false);
 assert.equal(result.campaign.execution.executionConnected,false);
 assert.deepEqual(result.continuation.browserEvidence,before.continuation.browserEvidence);
 assert.equal(result.continuation.goalStatus,'active');
 assert.equal(result.continuation.lastReceiptId,before.campaign.records.at(-1).mailId,
  'latest must mean latest verified send time,not merely last appended array row');
});

test('old verified65/25 synchronization stays historical success but newer71/31 is pending',()=>{
 const input=fixture(),result=buildCampaignCheckpoint(input);
 assertCounts(result,71,31);
 const sync=result.continuation.synchronization;
 assert.equal(sync.verified,true);
 assert.equal(sync.latestLocalCountsPending,true);
 assert.equal(sync.coversLatestLocalData,false);
 assert.equal(sync.synchronizedConfirmedCount,65);
 assert.equal(sync.synchronizedToday,25);
 assert.equal(sync.proof,input.continuation.synchronization.proof);
 assert.equal(sync.source,SOURCE_SHA);
 assert.equal(sync.github,GITHUB_SHA);
 assert.equal(sync.siteVersion,210);
 const campaignSync=result.campaign.execution.latestSynchronization;
 assert.equal(campaignSync.verified,true);
 assert.equal(campaignSync.latestLocalCountsPending,true);
 assert.equal(campaignSync.coversLatestLocalData,false);
 assert.equal(campaignSync.synchronizedConfirmedCount,65);
 assert.equal(campaignSync.synchronizedToday,25);
 assert.equal(campaignSync.proof,input.continuation.synchronization.proof);
 assert.equal(campaignSync.privateSourceSha,SOURCE_SHA);
 assert.equal(campaignSync.githubSha,GITHUB_SHA);
 assert.equal(campaignSync.siteVersion,210);
});

test('without any prior remote proof synchronized counts remain null and no success is fabricated',()=>{
 const input=fixture({synced:false}),result=buildCampaignCheckpoint(input);
 assertCounts(result,71,31);
 for(const sync of [result.continuation.synchronization,result.campaign.execution.latestSynchronization]){
  assert.equal(sync.verified,false);
  assert.equal(sync.synchronizedConfirmedCount,null);
  assert.equal(sync.synchronizedToday,null);
  assert.equal(sync.latestLocalCountsPending,true);
  assert.equal(sync.coversLatestLocalData,false);
  for(const key of ['github','githubSha','source','privateSourceSha','siteVersion','deploymentId','siteDeployment'])
   assert.ok(sync[key]===undefined||sync[key]===null,`fabricated remote proof field: ${key}`);
 }
});

test('same counts and latest ID cannot hide a corrected older receipt from synchronization',()=>{
 const input=fixture(),first=buildCampaignCheckpoint(input);
 const current={...input,campaign:first.campaign,receipt:null,continuation:{...first.continuation,
  synchronization:{...first.continuation.synchronization,verified:true,synchronizedConfirmedCount:71,
   synchronizedToday:31,receiptDigest:first.continuation.receiptDigest,
   latestLocalCountsPending:false,coversLatestLocalData:true}}};
 assert.equal(buildCampaignCheckpoint(current).continuation.synchronization.coversLatestLocalData,true);
 const changed=clone(current);changed.campaign.records[0].sourceEvidence='Corrected older synthetic source evidence';
 const next=buildCampaignCheckpoint(changed);
 assert.equal(next.campaign.confirmedCount,71);assert.equal(next.continuation.confirmedToday,31);
 assert.equal(next.continuation.lastReceiptId,current.continuation.lastReceiptId);
 assert.notEqual(next.continuation.receiptDigest,current.continuation.receiptDigest);
 assert.equal(next.continuation.synchronization.coversLatestLocalData,false);
 assert.equal(next.continuation.synchronization.latestLocalCountsPending,true);
 assert.equal(next.continuation.synchronization.proof,current.continuation.synchronization.proof);
});

test('an already-counted exact message ID cannot also be present in exclusions',()=>{
 const input=fixture(),first=buildCampaignCheckpoint(input);
 const current={...input,campaign:first.campaign,continuation:first.continuation,receipt:null};
 assert.doesNotThrow(()=>buildCampaignCheckpoint(current));
 current.campaign.excludedReceipts.push({...current.campaign.records[0],countAsNewCustomer:false});
 assert.throws(()=>buildCampaignCheckpoint(current),/Duplicate|excluded/i);
});
