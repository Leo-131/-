import {createHash} from 'node:crypto';

const sha256=value=>createHash('sha256').update(value,'utf8').digest('hex');
const fail=()=>{throw Error('Unverified channel receipt');};
const isHash=value=>typeof value==='string' && /^[a-f\d]{64}$/i.test(value);
const nonMessageActions=new Set(['invite','invitation','invitation_sent','connection_request',
  'connection_request_sent','connection_invite','follow','followed','accepted','invitation_accepted',
  'connection_accepted','draft','unknown','send_unconfirmed','prepared_not_sent',
  'website_form','form_submission','form_submitted','submitted_confirmed']);
const actualTime=value=>{
  if(typeof value!=='string' || !value.trim())return fail();
  const timestamp=Date.parse(value);
  if(!Number.isFinite(timestamp))return fail();
  return timestamp;
};

// URL parsing alone accepts alternate spellings, userinfo and non-web schemes.
// This boundary deliberately supports only LinkedIn's public HTTPS hostnames.
function linkedinUrl(value,kind) {
  if(typeof value!=='string' || !/^https:\/\//i.test(value) || value.trim()!==value
      || /[\s\\]/u.test(value))return null;
  let url;
  try {url=new URL(value);} catch {return null;}
  if(url.protocol!=='https:' || url.username || url.password || url.port
      || !['linkedin.com','www.linkedin.com'].includes(url.hostname))return null;
  const path=url.pathname.replace(/\/$/,'');
  const pattern=kind==='sender'?/^\/in\/[a-zA-Z0-9_-]+$/
    :kind==='recipient'?/^\/company\/[a-zA-Z0-9_-]+$/
      :/^\/messaging\/thread\/[a-zA-Z0-9_=-]+$/;
  if(!pattern.test(path))return null;
  // Query/fragment parameters do not change the verified account or thread.
  return `https://www.linkedin.com${path}/`;
}

const instagramReservedRoutes=new Set(['accounts','account','direct','explore','p','reel','reels',
  'stories','tv','about','developer','developers','legal','privacy','terms','emails','api','graphql',
  'oauth','challenge','checkpoint','web','download','directory','nametag','qr','archive','saved',
  'login','logout','signin','signup','help','support','static','business','press','music','search',
  'notifications','settings','your_activity','push','create','ads','professional_dashboard']);
const instagramNonMessageActions=new Set(['chat_opened','conversation_opened','message_window_opened',
  'profile_opened','message_button_clicked','chat_ready']);

// A deliberately bounded public-profile grammar. Check the literal path before
// URL normalization so encoded hosts, dot segments and application routes cannot
// become a different verified identity. Numeric thread IDs remain strings.
function instagramUrl(value,kind) {
  if(typeof value!=='string' || value.trim()!==value || /[\s\\\u0000-\u001f\u007f]/u.test(value))return null;
  const literal=value.match(/^https:\/\/(?:www\.)?instagram\.com(\/[^?#]*)/i);
  if(!literal)return null;
  let url;
  try {url=new URL(value);} catch {return null;}
  if(url.protocol!=='https:' || url.username || url.password || url.port
      || !['instagram.com','www.instagram.com'].includes(url.hostname)
      || url.pathname!==literal[1])return null;
  const path=url.pathname.replace(/\/$/,'');
  if(kind==='thread')return /^\/direct\/t\/[1-9]\d*$/.test(path)
    ?`https://www.instagram.com${path}/`:null;
  const match=path.match(/^\/([a-zA-Z0-9_](?:[a-zA-Z0-9._]{0,28}[a-zA-Z0-9_])?)$/);
  if(!match)return null;
  const handle=match[1].toLowerCase();
  if(handle.includes('..') || instagramReservedRoutes.has(handle))return null;
  return `https://www.instagram.com/${handle}/`;
}

/**
 * Pure receipt identity validation, not authorization to contact or proof that
 * a screenshot's bytes exist. The controller must independently collect and
 * retain real browser evidence and enforce sender, ICP and company/group gates.
 * Social evidence keys are LOCAL; they are never fabricated provider IDs.
 * Image-format/file-byte verification remains the controller/helper boundary.
 */
export function verifiedReceiptKey(row) {
  if(!row || typeof row!=='object' || Array.isArray(row))return fail();
  const channel=row.channel===undefined?'email':row.channel;
  const emailId=row.mailId || row.messageId;
  if(channel==='email') {
    if(!/^1_0:/.test(emailId || '')
        || (row.receiptEvidence?.channel!==undefined && row.receiptEvidence.channel!=='email'))return fail();
    return emailId;
  }
  if(!['linkedin','instagram'].includes(channel) || row.status!=='sent_confirmed'
      || [row.mailId,row.messageId,row.providerMessageId].some(value=>/^\d+_\d+:/.test(value || '')))return fail();
  const evidence=row.receiptEvidence;
  if(!evidence || typeof evidence!=='object' || Array.isArray(evidence)
      || evidence.channel!==channel
      || [row.action,row.type,row.eventType,evidence.action,evidence.type,evidence.status,
        ...(channel==='instagram'?[evidence.eventType]:[])]
        .some(value=>nonMessageActions.has(value) || (channel==='instagram'
          && typeof value==='string' && instagramNonMessageActions.has(value.trim().toLowerCase())))
      || evidence.independentlyReopened!==true || evidence.outgoingVisible!==true
      || evidence.senderVerified!==true || evidence.recipientVerified!==true
      || !isHash(evidence.screenshotSha256)
      || typeof evidence.body!=='string' || !evidence.body.trim()
      || !isHash(evidence.bodySha256)
      || sha256(evidence.body)!==evidence.bodySha256.toLowerCase())return fail();
  const channelUrl=channel==='linkedin'?linkedinUrl:instagramUrl;
  const sender=channelUrl(evidence.senderProfileUrl,'sender');
  const recipient=channelUrl(evidence.recipientProfileUrl,'recipient');
  const thread=channelUrl(evidence.conversationUrl,'thread');
  if(!sender || !recipient || !thread || (channel==='instagram' && sender===recipient))return fail();
  const targets=[row.target_url,row.officialSocialUrl,row.source]
    .map(value=>channelUrl(value,'recipient')).filter(Boolean);
  if(!targets.includes(recipient))return fail();
  const sentAt=actualTime(row.sentAtLocal || row.timestamp);
  if(actualTime(evidence.observedAt)<sentAt)return fail();
  const canonical=JSON.stringify([thread,sender,recipient,new Date(sentAt).toISOString(),evidence.bodySha256.toLowerCase()]);
  const key=`${channel}-evidence-sha256:${sha256(canonical)}`;
  if(row.receiptKey!==undefined && row.receiptKey!==key)return fail();
  if(row.receiptEvidenceHistory!==undefined) {
    if(!Array.isArray(row.receiptEvidenceHistory))return fail();
    for(const observation of row.receiptEvidenceHistory) {
      // Validate every retained snapshot against THIS message identity, even
      // when the record is first ingested rather than merged with another row.
      if(verifiedReceiptKey({...row,receiptEvidence:observation,
          receiptEvidenceHistory:undefined,receiptKey:key})!==key)return fail();
    }
  }
  return key;
}

// The company profile itself is a cross-name company identity, never the shared
// linkedin.com host. Only an independently verified outgoing social receipt may
// introduce this key; an arbitrary profile URL on an email row cannot do so.
export function verifiedSocialCompanyIdentity(row) {
  if(!['linkedin','instagram'].includes(row?.channel))return null;
  verifiedReceiptKey(row);
  if(row.channel==='instagram')return `instagram-business:${instagramUrl(row.receiptEvidence.recipientProfileUrl,'recipient').split('/')[3]}`;
  return `official-social-company:${linkedinUrl(row.receiptEvidence.recipientProfileUrl,'recipient')}`;
}

const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined)
    .map(key=>[key,stable(value[key])])):value;

// Additional observations do not create a new message identity. Retain every
// distinct valid observation (including its screenshot hash) and select the
// latest as the current evidence. Never accept history for another message.
export function mergeVerifiedReceiptObservations(previous,next) {
  const key=verifiedReceiptKey(previous);
  if(verifiedReceiptKey(next)!==key)return fail();
  if(!['linkedin','instagram'].includes(previous.channel) || previous.channel!==next.channel)return {...previous,...next};
  const observations=[],seen=new Set();
  for(const owner of [previous,next]) {
    if(owner.receiptEvidenceHistory!==undefined && !Array.isArray(owner.receiptEvidenceHistory))return fail();
    for(const evidence of [...(owner.receiptEvidenceHistory||[]),owner.receiptEvidence]) {
      if(verifiedReceiptKey({...owner,receiptEvidence:evidence,receiptEvidenceHistory:undefined,receiptKey:key})!==key)return fail();
      const observationKey=JSON.stringify(stable(evidence));
      if(!seen.has(observationKey)) {seen.add(observationKey);observations.push({...evidence});}
    }
  }
  const latest=observations.reduce((best,evidence)=>!best
    || actualTime(evidence.observedAt)>=actualTime(best.observedAt)?evidence:best,null);
  const merged={...previous,...next,receiptEvidence:{...latest}};
  if(observations.length>1 || previous.receiptEvidenceHistory!==undefined || next.receiptEvidenceHistory!==undefined)
    merged.receiptEvidenceHistory=observations;
  return merged;
}
