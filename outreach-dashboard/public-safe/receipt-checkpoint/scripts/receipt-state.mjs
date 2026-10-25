import '../web/outreach-efficiency.js';
import {verifiedReceiptKey,verifiedSocialCompanyIdentity,mergeVerifiedReceiptObservations} from './channel-receipt-state.mjs';
export const isKnownCountry=value=>typeof value==='string'&&!!value.trim()
  && !/unknown|unverified|unspecified|global|待核|未知/i.test(value);

// Sent is a historical event, not proof of valid new-customer delivery. Only
// explicit machine states exclude counting; never infer failure from free text.
export const isExcludedNewCustomerReceipt=row=>row?.countAsNewCustomer===false
  || ['hard_bounced','delivery_failed'].includes(row?.deliveryStatus)
  || ['excluded_hard_bounce','excluded_delivery_failure','excluded_prior_group_contact'].includes(row?.newCustomerDevelopmentStatus);

export function actualExecutionDay(row) {
  const timestamp=row.sentAtLocal || row.timestamp;
  const value=Date.parse(timestamp);
  if(!timestamp || !Number.isFinite(value))throw Error('Actual sent timestamp required');
  const day=new Date(value+8*3600000).toISOString().slice(0,10);
  if(row.executionDate && row.executionDate!==day)throw Error('Execution date disagrees with actual timestamp');
  return day;
}

export function receiptBatchDate(fixed,executionDate) {
  if(!Array.isArray(fixed?.records) || fixed.confirmedCount!==fixed.records.length
      || fixed.target!==100 || fixed.records.length>100)throw Error('Invalid fixed batch state');
  return fixed.records.length<100?fixed.date:executionDate;
}

// A pure post-confirmation ledger; never authorizes a send or changes an input.
export function buildDailyLedger({date,fixedRecords=[],existing=null,receipt=null}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)
      || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid day');
  if(existing && (existing.date!==date || !Array.isArray(existing.records)
      || existing.confirmedCount!==existing.records.length))throw Error('Invalid daily state');
  const byId=new Map(),owners=new Map(),records=[];
  const candidates=[...fixedRecords,...(existing?.records || []),...(receipt?[receipt]:[])];
  for(const row of candidates) {
    const day=actualExecutionDay(row);
    if(day!==date) {
      if(row===receipt || existing?.records.includes(row))throw Error('Wrong actual-date receipt');
      continue;
    }
    const id=verifiedReceiptKey(row);
    if(row.status!=='sent_confirmed' || !row.company
        || !(row.icp>70) || !isKnownCountry(row.country)
        || isExcludedNewCustomerReceipt(row))throw Error('Unverified receipt');
    const previous=byId.get(id);
    const keys=[...globalThis.OutreachEfficiency.identityKeys({...row,website:row.source})
      .filter(key=>!key.startsWith('id:')),verifiedSocialCompanyIdentity(row)].filter(Boolean);
    if(previous) {
      if(previous.company!==row.company
          || previous.country!==row.country || previous.icp!==row.icp
          || Date.parse(previous.sentAtLocal || previous.timestamp)!==Date.parse(row.sentAtLocal || row.timestamp))
        throw Error('Conflicting message ID');
      if(keys.some(key=>owners.has(key)&&owners.get(key)!==id))throw Error('Company/group already counted');
      keys.forEach(key=>owners.set(key,id));
      const merged=row.channel==='linkedin'?mergeVerifiedReceiptObservations(previous,row):{...previous,...row};
      records[records.indexOf(previous)]=merged;byId.set(id,merged);
      continue;
    }
    if(keys.some(key=>owners.has(key)))throw Error('Company/group already counted');
    keys.forEach(key=>owners.set(key,id));byId.set(id,row);records.push(row);
  }
  return {...existing,date,timezone:'Asia/Shanghai',target:100,
    scope:'unique verified new-company receipts on actual execution date',
    confirmedCount:records.length,remaining:Math.max(0,100-records.length),
    records,privateData:true,publicGitHubUploadAllowed:false};
}

export function missingVerifiedReceipts(source,existing) {
  if(!Array.isArray(source)||!Array.isArray(existing))throw Error('Receipt arrays required');
  const ids=new Set(existing.flatMap(row=>{
    if(row.channel==='linkedin') {
      // Legacy invites/profile URLs and asserted local keys are not evidence.
      // A strictly typed, complete new social receipt can be indexed even when
      // the caller has not persisted its optional computed key yet.
      if(!row.task_id?.startsWith('verified-social-linkedin-') || row.status!=='sent_confirmed')return [];
      return [verifiedReceiptKey(row)];
    }
    if(row.channel===undefined || row.channel==='email')return [row.receiptKey||row.messageId].filter(Boolean);
    return [];
  }));
  return source.filter(row=>{
    if(!['verified-email-','verified-social-linkedin-'].some(prefix=>row.task_id?.startsWith(prefix))||row.status!=='sent_confirmed')return false;
    if(row.task_id.startsWith('verified-social-linkedin-')?row.channel!=='linkedin'
      :row.channel!==undefined&&row.channel!=='email')throw Error('Receipt task/channel mismatch');
    const id=verifiedReceiptKey(row);if(ids.has(id))return false;
    if(!isKnownCountry(row.country)||!(row.icpScore>70)
        ||!row.batchDate||!row.executionDate||actualExecutionDay(row)!==row.executionDate)
      throw Error('Missing or contradictory verified receipt metadata');
    ids.add(id);return true;
  });
}
