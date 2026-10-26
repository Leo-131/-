// Pure, fail-closed checks of a fresh host-observed AliMail accessibility snapshot.
// This module has no browser, network, storage, login or Send capabilities.
export const aliMailUiEvidenceContract=Object.freeze({
 version:'alimail-current-surface-v1',module:'server/alimail-ui-evidence.mjs',
 export:'verifyAliMailUiEvidence',hostAdapterRequired:true,createsHostConnection:false,
 snapshot:'fresh-authorized-visible-native-AX-not-global-editor-innerText',
 composer:'last-recipient-combobox-section/More-to-Send',sent:'last-non-tooltip-iframe',
 comparison:'whitespace-normalized-exact-body-and-ordered-exact-links',
 unknownSend:'reconcile-sent-never-resend',grantsSendAuthorization:false,
 independentChecks:'sender/recipient/company-group/history/territory/ICP/actual-hrefs/receipt',
});

const normalized=value=>String(value).normalize('NFC').replace(/\s+/gu,' ').trim();
const decode=value=>{
 const s=value.trim();if(!s.startsWith('"'))return s;
 try {const result=JSON.parse(s);return typeof result==='string'?result:s;}catch{return s;}
};
const recipientLabel=value=>/^(?:收件人|To|Recipients)[:：]?$/i.test(normalized(value));
const sendButton=node=>node.role==='button'&&/^(?:send-icon\s+)?(?:发送|Send)$/i.test(node.name);
const moreButton=node=>node.role==='button'&&/^(?:More|更多)$/i.test(node.name);
const outcome=(reasons,extra={})=>({ok:reasons.length===0,reasons,maySend:false,mayRetrySend:false,...extra});

function readNodes(snapshot) {
 if(typeof snapshot!=='string'||!snapshot.trim()||snapshot.length>2_000_000)return null;
 const raw=snapshot.replace(/^\uFEFF/,'').split(/\r?\n/);if(raw.length>30_000)return null;
 const nodes=[],stack=[];
 for(let line=0;line<raw.length;line++){
  if(!raw[line].trim())continue;
  const m=raw[line].match(/^(\s*)-\s+([a-z][\w-]*|\/url)(?:\s+("(?:[^"\\]|\\.)*"))?(.*)$/i);
  if(!m)return null;
  const depth=m[1].length,role=m[2].toLowerCase(),suffix=m[4],colon=suffix.indexOf(':');
  const attrs=colon<0?suffix:suffix.slice(0,colon);
  const node={depth,role,name:m[3]?decode(m[3]):'',value:colon<0?'':decode(suffix.slice(colon+1)),attrs,line};
  while(stack.length&&stack.at(-1).depth>=depth)stack.pop();
  const ignored=stack.some(x=>x.ignored)||role==='tooltip'||/\[(?:hidden|invisible)(?:=true)?\]|aria-hidden[=:]true/i.test(attrs);
  stack.push({depth,ignored});if(!ignored)nodes.push(node);
 }
 return nodes;
}
function subtreeEnd(nodes,start) {
 let end=start+1;while(end<nodes.length&&nodes[end].depth>nodes[start].depth)end++;return end;
}
function composers(nodes) {
 return nodes.flatMap((n,i)=>n.role==='generic'&&recipientLabel(n.name)
  &&nodes.slice(i+1,subtreeEnd(nodes,i)).some(c=>c.role==='combobox'&&recipientLabel(c.name))?[i]:[]);
}
function pickerOpen(nodes) {
 return nodes.some((n,i)=>{
  if(n.role==='button'&&/模板|template/i.test(n.name)&&/\[expanded(?:=true)?\]/i.test(n.attrs))return true;
  if(n.role==='menuitem'&&/模板|template/i.test(n.name||n.value))return true;
  return ['dialog','menu','listbox'].includes(n.role)&&/模板|template/i.test(
   [n.name,n.value,...nodes.slice(i+1,subtreeEnd(nodes,i)).map(c=>c.name||c.value)].join(' '));
 });
}
const textRole=node=>['generic','text','paragraph','heading'].includes(node.role);
function content(nodes) {
 const parts=[],links=[];let hrefs=0,plain=0;
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i];
  if(n.role==='link'){
   const children=nodes.slice(i+1,subtreeEnd(nodes,i));
   const urls=children.filter(c=>c.role==='/url');
   if(urls.length!==1||!/^https?:\/\/\S+$/i.test(urls[0].value))return {error:'link_href_missing_or_invalid'};
   parts.push(n.name||n.value);links.push(urls[0].value);hrefs++;i=subtreeEnd(nodes,i)-1;continue;
  }
  if(!textRole(n))continue;
  // Ignore a named container's roll-up when its text is already in descendants.
  if(nodes.slice(i+1,subtreeEnd(nodes,i)).some(c=>textRole(c)&&(c.value||c.name)))continue;
  const value=n.value||n.name;if(!value)continue;parts.push(value);
  const found=value.match(/https?:\/\/[^\s<>"']+/giu)||[];links.push(...found);plain+=found.length;
 }
 return {bodyNormalized:normalized(parts.join(' ')),links,
  linkEvidence:hrefs&&plain?'mixed_ax_hrefs_and_visible_urls':hrefs?'ax_hrefs':'visible_url_text',
  actualHrefVerificationRequired:plain>0};
}

export function extractAliMailUiEvidence(snapshot,{surface='composer',templatePanelOpen=false}={}) {
 const nodes=readNodes(snapshot);if(!nodes||!['composer','sent'].includes(surface))return outcome(['invalid_snapshot_or_surface']);
 const current=composers(nodes),last=current.at(-1);
 let start,end,header=[],recipientNodes=[];
 if(surface==='composer'){
  if(last===undefined)return outcome(['current_composer_missing']);
  const depth=nodes[last].depth;
  const section=nodes.slice(last),mores=section.flatMap((n,i)=>moreButton(n)&&n.depth===depth?[last+i]:[]);
  if(mores.length!==1)return outcome(['composer_toolbar_missing_or_ambiguous']);
  const more=mores[0],sends=nodes.flatMap((n,i)=>i>more&&sendButton(n)&&n.depth===depth?[i]:[]);
  if(sends.length!==1||/\[disabled(?:=true)?\]/i.test(nodes[sends[0]].attrs))return outcome(['current_send_boundary_missing_or_disabled']);
  end=sends[0];
  start=subtreeEnd(nodes,more);header=nodes.slice(last,more);
  recipientNodes=nodes.slice(last,subtreeEnd(nodes,last));
  if(templatePanelOpen||pickerOpen(nodes))return outcome(['template_picker_open']);
 }else{
  if(current.length)return outcome(['current_composer_present']);
  const frames=nodes.flatMap((n,i)=>n.role==='iframe'?[i]:[]),frame=frames.at(-1);
  if(frame===undefined)return outcome(['sent_iframe_missing']);
  if(frames.some(i=>i<frame&&subtreeEnd(nodes,i)>frame))return outcome(['nested_sent_iframe_ambiguous']);
  const previous=frames.at(-2),headerFloor=previous===undefined?0:subtreeEnd(nodes,previous);
  const region=nodes.slice(headerFloor,frame);
  const marker=region.map((n,i)=>n.role==='generic'&&recipientLabel(n.value||n.name)?i:-1).filter(i=>i>=0).at(-1);
  header=marker===undefined?[]:region.slice(marker);
  const nextField=header.findIndex((n,i)=>i>0&&n.role==='generic'&&/^(?:主\s*题|抄\s*送|密\s*送|发件人)[:：]?$/.test(n.value||n.name));
  recipientNodes=nextField<0?header:header.slice(0,nextField);
  start=frame+1;end=subtreeEnd(nodes,frame);
 }
 const body=content(nodes.slice(start,end));if(body.error)return outcome([body.error]);
 if(!body.bodyNormalized)return outcome(['body_missing']);
 let subject;
 if(surface==='composer')subject=header.find(n=>n.role==='textbox'&&/^(?:主题|Subject)$/i.test(n.name))?.value;
 else {
  const marker=header.map((n,i)=>n.role==='generic'&&/^主\s*题[:：]?$/.test(n.value)?i:-1).filter(i=>i>=0).at(-1);
  if(marker!==undefined)subject=header.slice(marker+1).find(n=>n.role==='generic'&&n.value)?.value;
 }
 const emails=[...new Set(recipientNodes.filter(n=>!['combobox','textbox'].includes(n.role))
  .flatMap(n=>(n.value||n.name).match(/[\w.!#$%&'*+\-/=?^`{|}~]+@[\w.-]+\.[a-z]{2,}/gi)||[]))];
 return outcome([],{surface,...body,subject:subject===undefined?null:normalized(subject),headerEmails:emails,
  scope:{startLine:nodes[start]?.line??0,endLine:nodes[end]?.line??nodes.at(-1)?.line??0}});
}

export function verifyAliMailUiEvidence({snapshot,surface='composer',expected,sendState,templatePanelOpen=false}={}) {
 if(surface==='composer'&&!['prepared_not_sent','not_started'].includes(sendState))
  return outcome(['send_state_locked'],{action:sendState==='sent_confirmed'?'next_customer':'reconcile_sent_only'});
 if(!expected||typeof expected.body!=='string'||!normalized(expected.body)||!Array.isArray(expected.links))
  return outcome(['invalid_expected_evidence']);
 const links=expected.links.map(v=>typeof v==='string'?v:v?.href);
 if(links.some(v=>typeof v!=='string'||!/^https?:\/\/\S+$/i.test(v)))return outcome(['invalid_expected_links']);
 const evidence=extractAliMailUiEvidence(snapshot,{surface,templatePanelOpen});
 if(!evidence.ok)return outcome(evidence.reasons,{action:'fresh_scoped_observation_required'});
 const reasons=[];
 if(evidence.bodyNormalized!==normalized(expected.body))reasons.push('body_mismatch');
 if(links.length!==evidence.links.length||links.some((v,i)=>v!==evidence.links[i]))reasons.push('links_mismatch');
 if(expected.subject!==undefined&&(typeof expected.subject!=='string'||normalized(expected.subject)!==evidence.subject))reasons.push('subject_mismatch');
 if(expected.recipient!==undefined&&(typeof expected.recipient!=='string'||evidence.headerEmails.length!==1
  ||evidence.headerEmails[0].toLowerCase()!==expected.recipient.toLowerCase()))reasons.push('recipient_mismatch_or_unverified');
 return outcome(reasons,{action:reasons.length?'reject_mismatch':'evidence_matches_only',evidence,
  actualHrefVerificationRequired:evidence.actualHrefVerificationRequired});
}

export function aliMailUiRecoveryDecision({operation,sendState,attempts=0,freshNativeObservation=false,
 uniqueVisibleControls=0,priorOperationSettled=false}={}) {
 const result=action=>({action,maySend:false,mayRetrySend:false,restartBrowser:false,changesLoginState:false});
 if(operation==='send'||!['prepared_not_sent','not_started'].includes(sendState))return result('reconcile_sent_only');
 if(!['read','compose_control'].includes(operation)||!Number.isInteger(attempts)||attempts<0||attempts>=1)return result('checkpoint_and_isolate');
 if(!freshNativeObservation)return result('fresh_native_ax_required');
 if(operation==='read')return result('read_scoped_evidence_only');
 if(uniqueVisibleControls!==1||!priorOperationSettled)return result('checkpoint_and_isolate');
 return result('recover_control_once');
}
