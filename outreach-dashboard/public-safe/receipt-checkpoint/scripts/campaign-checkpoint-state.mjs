// Pure post-Sent reconciliation. Never sends, retries, writes or asserts delivery.
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {actualExecutionDay,isKnownCountry} from './receipt-state.mjs';

const receiptId=row=>row?.mailId||row?.messageId;
const keys=row=>globalThis.OutreachEfficiency.identityKeys({...row,website:row.source})
 .filter(key=>!key.startsWith('id:'));
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])])):value;
export function campaignReceiptDigest({campaign,daily}){
 const byId=rows=>[...rows].sort((a,b)=>String(receiptId(a)).localeCompare(String(receiptId(b))));
 return createHash('sha256').update(JSON.stringify(stable({campaignId:campaign.id,target:campaign.target,
  receipts:byId(campaign.records),excluded:byId(campaign.excludedReceipts||[]),date:daily.date,
  dailyTarget:daily.target,dailyReceipts:byId(daily.records)}))).digest('hex');
}
function validReceipt(row){
 const id=receiptId(row),time=Date.parse(row?.sentAtLocal||row?.timestamp);
 if(!row||row.status!=='sent_confirmed'||!/^1_0:/.test(id||'')||!row.company
  ||!(row.icp>70)||!isKnownCountry(row.country)||!Number.isFinite(time)||row.countAsNewCustomer===false)
  throw Error('Verified campaign receipt required');
 actualExecutionDay(row);return {id,time};
}
function sameReceipt(left,right){
 const core=row=>({id:receiptId(row),company:row.company,country:row.country,icp:row.icp,
  group:row.group||null,aliases:[...keys(row)].sort(),
  confirmationEvidence:row.confirmationEvidence||null,source:row.source||null,
  sourceEvidence:row.sourceEvidence||null,scoreBreakdown:row.scoreBreakdown||null,
  time:Date.parse(row.sentAtLocal||row.timestamp),email:row.publicBusinessEmail||row.recipientEmail||null});
 return isDeepStrictEqual(core(left),core(right));
}
function snapshotSynchronization(previous,prior){
 const sync={...(previous||{})};
 // A verified snapshot is historical evidence, not proof that later rows synced.
 const covered=sync.verified===true&&sync.latestLocalCountsPending!==true
  &&sync.coversLatestLocalData!==false;
 sync.synchronizedConfirmedCount=Number.isInteger(sync.synchronizedConfirmedCount)?sync.synchronizedConfirmedCount
  :covered&&Number.isInteger(prior?.confirmedCount)?prior.confirmedCount:null;
 sync.synchronizedToday=Number.isInteger(sync.synchronizedToday)?sync.synchronizedToday
  :covered&&Number.isInteger(prior?.confirmedToday)?prior.confirmedToday:null;
 sync.verified=sync.verified===true;
 return sync;
}

export function buildCampaignCheckpoint({campaign,daily,continuation={},receipt=null,verifiedAt}){
 if(!campaign||!campaign.id||!Number.isSafeInteger(campaign.target)||campaign.target<1
  ||!Array.isArray(campaign.records)||campaign.confirmedCount!==campaign.records.length
  ||campaign.remaining!==Math.max(0,campaign.target-campaign.records.length)
  ||campaign.records.length>campaign.target||!Number.isFinite(Date.parse(campaign.startedAt)))
  throw Error('Invalid campaign state');
 if(!daily||!/^\d{4}-\d{2}-\d{2}$/.test(daily.date||'')||!Array.isArray(daily.records)
  ||daily.confirmedCount!==daily.records.length||!Number.isSafeInteger(daily.target)||daily.target<1
  ||daily.remaining!==Math.max(0,daily.target-daily.records.length))throw Error('Invalid daily state');
 if(continuation.campaignId&&continuation.campaignId!==campaign.id)throw Error('Campaign identity mismatch');
 if(!Number.isFinite(Date.parse(verifiedAt)))throw Error('Verification timestamp required');
 const records=[...campaign.records],byId=new Map(),owners=new Map();
 const excludedIds=new Set((campaign.excludedReceipts||[]).map(receiptId));
 const started=Date.parse(campaign.startedAt);
 for(const row of records){
  const {id,time}=validReceipt(row);
  if(time<started||byId.has(id)||excludedIds.has(id)||keys(row).some(key=>owners.has(key)))
   throw Error('Duplicate or pre-campaign receipt');
  byId.set(id,row);keys(row).forEach(key=>owners.set(key,id));
 }
 if(receipt){
  const {id,time}=validReceipt(receipt),existing=byId.get(id);
  if(time<started)throw Error('Receipt precedes campaign');
  const excluded=campaign.excludedReceipts||[];
  if(excluded.some(row=>receiptId(row)===id))throw Error('Excluded receipt cannot be restored');
  if(existing){if(!sameReceipt(existing,receipt))throw Error('Conflicting message ID');}
  else{
   if(records.length>=campaign.target)throw Error('Campaign target already reached');
   if(keys(receipt).some(key=>owners.has(key))||excluded.some(row=>keys(row).some(key=>keys(receipt).includes(key))))
    throw Error('Company/group already contacted or excluded');
   records.push(receipt);byId.set(id,receipt);keys(receipt).forEach(key=>owners.set(key,id));
  }
 }
 const dailyIds=new Set();
 for(const row of daily.records){
  const {id,time}=validReceipt(row);
  if(actualExecutionDay(row)!==daily.date||dailyIds.has(id))throw Error('Daily receipt date or ID conflict');
  dailyIds.add(id);const match=byId.get(id);
  if(match&&!sameReceipt(match,row))throw Error('Daily/campaign receipt conflict');
  if(time>=started&&!match)throw Error('Daily receipt missing from campaign');
 }
 if(records.some(row=>actualExecutionDay(row)===daily.date&&!dailyIds.has(receiptId(row))))
  throw Error('Campaign receipt missing from daily ledger');
 const count=records.length,remaining=Math.max(0,campaign.target-count),today=daily.confirmedCount;
 const latest=records.reduce((best,row)=>!best||Date.parse(row.sentAtLocal||row.timestamp)
  >=Date.parse(best.sentAtLocal||best.timestamp)?row:best,null);
 const digest=campaignReceiptDigest({campaign:{...campaign,records},daily});
 const sync=snapshotSynchronization(continuation.synchronization,continuation);
 const covered=sync.verified&&sync.synchronizedConfirmedCount===count&&sync.synchronizedToday===today
  &&sync.receiptDigest===digest&&continuation.lastReceiptId===(latest?receiptId(latest):null)&&continuation.date===daily.date;
 sync.coversLatestLocalData=!!covered;sync.latestLocalCountsPending=!covered;
 const nextContinuation={...continuation,date:daily.date,timezone:'Asia/Shanghai',campaignId:campaign.id,
  goalStatus:count>=campaign.target?'complete':'active',status:count>=campaign.target?'completed':'ready_to_continue',
  target:campaign.target,confirmedCount:count,remaining,confirmedToday:today,dailyTarget:daily.target,
  dailyRemaining:daily.remaining,lastReceiptId:latest?receiptId(latest):null,verifiedAt,
  receiptDigest:digest,synchronization:sync,currentBlocker:continuation.currentBlocker??null,
  next:count>=campaign.target?'Campaign target reached; stop new-customer sending.':
   `Continue ${remaining} verified new companies; ${daily.date} daily ${today}/${daily.target}. `+
   (covered?'Latest local counts are remotely verified.':'New local receipts require remote synchronization; do not claim cloud/GitHub are current.')+
   ' Recheck permanent company/group locks before one Send; unknown outcomes never resend.',
  privateData:true,publicGitHubUploadAllowed:false};
 const execution={...campaign.execution,status:count>=campaign.target?'completed':'running',
  latestAudit:{...campaign.execution?.latestAudit,classification:'progress',confirmedCount:count,remaining,
   confirmedToday:today,verifiedAt,receiptDigest:digest,proof:'campaign and daily verified receipt ledgers',
   observation:'Counts derived from confirmed non-draft receipt IDs; delivery and human replies remain unverified.'},
  latestSynchronization:{...campaign.execution?.latestSynchronization,...sync,
   privateSourceSha:sync.source??sync.privateSourceSha??campaign.execution?.latestSynchronization?.privateSourceSha,
   deploymentId:sync.siteDeployment??sync.deploymentId??campaign.execution?.latestSynchronization?.deploymentId,
   githubSha:sync.github??sync.githubSha??campaign.execution?.latestSynchronization?.githubSha}};
 return {campaign:{...campaign,records,confirmedCount:count,remaining,execution},continuation:nextContinuation};
}
