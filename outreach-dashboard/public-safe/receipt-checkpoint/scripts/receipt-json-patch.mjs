// Pure rendering optimization. The caller still obtains `after` from the full
// canonical ledger builder; unsupported/ambiguous shapes return null, never a
// truncated replacement and never a write.
import {isDeepStrictEqual} from 'node:util';
import {buildDailyLedger} from './receipt-state.mjs';

const space=(text,index)=>{while(/\s/.test(text[index]||'')&&index<text.length)index++;return index;};
function stringEnd(text,start){
 for(let i=start+1;i<text.length;i++){
  if(text[i]==='\\'){i++;continue;}
  if(text[i]==='"')return i+1;
 }
 throw Error('Unterminated JSON string');
}
function valueEnd(text,start){
 if(text[start]==='"')return stringEnd(text,start);
 if(!['{','['].includes(text[start])){
  let end=start;while(end<text.length&&!/[\s,}\]]/.test(text[end]))end++;return end;
 }
 let depth=0;
 for(let i=start;i<text.length;i++){
  if(text[i]==='"'){i=stringEnd(text,i)-1;continue;}
  if(text[i]==='{'||text[i]==='[')depth++;
  else if(text[i]==='}'||text[i]===']'){if(--depth===0)return i+1;}
 }
 throw Error('Unterminated JSON container');
}
function rootMembers(text){
 let at=space(text,0);if(text[at++]!=='{')return null;
 const members=new Map();at=space(text,at);
 while(text[at]!=='}'){
  if(text[at]!=='"')return null;
  const keyEnd=stringEnd(text,at),key=JSON.parse(text.slice(at,keyEnd));
  if(members.has(key))return null; // JSON.parse alone would hide duplicate keys.
  const keyStart=at;at=space(text,keyEnd);if(text[at++]!==':')return null;
  at=space(text,at);const start=at,end=valueEnd(text,start);
  members.set(key,{keyStart,start,end});at=space(text,end);
  if(text[at]===',')at=space(text,at+1);else if(text[at]!=='}')return null;
 }
 return members;
}
function arrayElements(text,{start,end}){
 if(text[start]!=='['||text[end-1]!==']')return null;
 const elements=[];let at=space(text,start+1);
 while(at<end-1){
  const stop=valueEnd(text,at);elements.push({start:at,end:stop});at=space(text,stop);
  if(text[at]===',')at=space(text,at+1);else if(at!==end-1)return null;
 }
 return elements;
}
const lineStart=(text,at)=>text.lastIndexOf('\n',at-1)+1;
const lineEnd=(text,at)=>{const end=text.indexOf('\n',at);return end<0?text.length:end;};
function unique(text,anchor){
 // Literal full-line boundaries, rather than an incidental substring in a value.
 const wrapped='\n'+text+'\n',needle='\n'+anchor+'\n',first=wrapped.indexOf(needle);
 return first>=0&&wrapped.indexOf(needle,first+1)<0;
}
function hunk(before,after){
 return '@@\n'+before.split('\n').map(line=>'-'+line).join('\n')+'\n'
  +after.split('\n').map(line=>'+'+line).join('\n')+'\n';
}

export function compactDailyLedgerPatch(before,after){
 try{
  if(typeof before!=='string'||/\r(?!\n)/.test(before))return null;
  const text=before.replaceAll('\r\n','\n'),current=JSON.parse(text);
  // Match the existing full JSON.stringify replacement's semantics (e.g. the
  // canonical receipt may contain optional own properties whose value is undefined).
  after=JSON.parse(JSON.stringify(after));
  if(!current||!after||Array.isArray(current)||Array.isArray(after)
   ||!Array.isArray(current.records)||!Array.isArray(after.records)
   ||current.confirmedCount!==current.records.length||after.confirmedCount!==after.records.length
   ||after.records.length!==current.records.length+1||current.target!==100||after.target!==100
   ||current.remaining!==Math.max(0,100-current.records.length)
   ||after.remaining!==Math.max(0,100-after.records.length)
   ||!isDeepStrictEqual(current.records,after.records.slice(0,-1)))return null;
  const metadata=value=>Object.fromEntries(Object.entries(value)
   .filter(([key])=>!['records','confirmedCount','remaining'].includes(key)));
  if(!isDeepStrictEqual(metadata(current),metadata(after)))return null;
  const members=rootMembers(text),recordMember=members?.get('records');
  if(!recordMember)return null;
  const edits=[];
  for(const key of ['confirmedCount','remaining']){
   if(current[key]===after[key])continue;
   const member=members.get(key);if(!member)return null;
   const start=lineStart(text,member.keyStart),end=lineEnd(text,member.end),old=text.slice(start,end);
   if(!new RegExp('^  "'+key+'": '+current[key]+',?$').test(old)||!unique(text,old))return null;
   const next=old.slice(0,member.start-start)+after[key]+old.slice(member.end-start);
   edits.push({before:old,after:next,hunk:hunk(old,next)});
  }
  const elements=arrayElements(text,recordMember),row=after.records.at(-1);
  if(!elements||!row||typeof row!=='object'||Array.isArray(row))return null;
  const newLines=JSON.stringify(row,null,2).split('\n').map(line=>'    '+line);
  if(!elements.length){
   const start=lineStart(text,recordMember.keyStart),end=lineEnd(text,recordMember.end),old=text.slice(start,end);
   if(!/^  "records": \[\],?$/.test(old)||!unique(text,old))return null;
   const next='  "records": [\n'+newLines.join('\n')+'\n  ]'+(old.endsWith(',')?',':'');
   edits.push({before:old,after:next,hunk:hunk(old,next)});
  }else{
   const last=elements.at(-1),lines=text.split('\n');
   const startLine=text.slice(0,lineStart(text,last.start)).split('\n').length-1;
   const lastLine=text.slice(0,lineStart(text,last.end-1)).split('\n').length-1;
   const closeLine=text.slice(0,lineStart(text,recordMember.end-1)).split('\n').length-1;
   const open=text.slice(lineStart(text,recordMember.keyStart),lineEnd(text,recordMember.start));
   if(open!=='  "records": ['||!/^  \],?$/.test(lines[closeLine])
    ||text[last.end-1]!=='}'||!/^\s*$/.test(text.slice(last.end,lineStart(text,recordMember.end-1))))return null;
   // Grow only within the final receipt until its suffix is a unique literal
   // anchor; never match the closing bracket of an exclusions/metadata array.
   let from=lastLine,old=lines.slice(from,closeLine+1).join('\n');
   while(!unique(text,old)&&from>startLine)old=lines.slice(--from,closeLine+1).join('\n');
   if(!unique(text,old))return null;
   const finalLine=lines[lastLine],offset=last.end-lineStart(text,last.end-1);
   const amended=finalLine.slice(0,offset)+','+finalLine.slice(offset);
   const prefix=lines.slice(from,lastLine),suffix=lines.slice(lastLine+1,closeLine+1);
   const next=[...prefix,amended,...newLines,...suffix].join('\n');
   const proposal='@@\n'+prefix.map(line=>' '+line+'\n').join('')+'-'+finalLine+'\n+'
    +amended+'\n'+newLines.map(line=>'+'+line+'\n').join('')+suffix.map(line=>' '+line+'\n').join('');
   edits.push({before:old,after:next,hunk:proposal});
  }
  // Native apply_patch consumes source hunks in file order. Do not rely on a
  // global replacement simulation: arbitrary root-key order must remain safe.
  for(const edit of edits){
   if(!unique(text,edit.before))return null;
   edit.start=('\n'+text+'\n').indexOf('\n'+edit.before+'\n');
  }
  edits.sort((left,right)=>left.start-right.start);
  for(let index=1;index<edits.length;index++){
   const previous=edits[index-1];
   if(previous.start+previous.before.length>edits[index].start)return null;
  }
  // Final proof: the literal edits must apply once and parse to the complete
  // canonical result, including all old records, exclusions and user metadata.
  const canonical=buildDailyLedger({date:current.date,existing:current,receipt:row});
  if(!isDeepStrictEqual(JSON.parse(JSON.stringify(canonical)),after))return null;
  let applied=text;
  for(const edit of edits){
   if(!unique(applied,edit.before))return null;
   const at=('\n'+applied+'\n').indexOf('\n'+edit.before+'\n');
   applied=applied.slice(0,at)+edit.after+applied.slice(at+edit.before.length);
  }
  if(!isDeepStrictEqual(JSON.parse(applied),after))return null;
  return edits.map(edit=>edit.hunk).join('');
 }catch{return null;}
}

// Campaign state is derived/validated by buildCampaignCheckpoint first. Render
// only its append and derived summary fields, retaining all prior receipt bytes.
export function compactCampaignCheckpointPatch(before,after){
 try{
  const text=before.replaceAll('\r\n','\n'),current=JSON.parse(text);
  after=JSON.parse(JSON.stringify(after));
  if(!Array.isArray(current.records)||!Array.isArray(after.records)
   ||current.confirmedCount!==current.records.length||after.confirmedCount!==after.records.length
   ||current.target!==after.target||!Number.isSafeInteger(current.target)||current.target<1
   ||current.remaining!==Math.max(0,current.target-current.records.length)
   ||after.remaining!==Math.max(0,after.target-after.records.length))return null;
  const appended=after.records.length===current.records.length+1;
  if(!isDeepStrictEqual(current.records,appended?after.records.slice(0,-1):after.records))return null;
  const metadata=value=>Object.fromEntries(Object.entries(value)
   .filter(([key])=>!['records','confirmedCount','remaining','execution'].includes(key)));
  if(!isDeepStrictEqual(metadata(current),metadata(after)))return null;
  const members=rootMembers(text),edits=[];
  if(!members)return null;
  // Bind the eligibility exclusion snapshot at apply time, not only when this
  // proposal was generated. A concurrent bounce/exclusion must invalidate it.
  const excluded=members.get('excludedReceipts');if(!excluded)return null;
  const guardStart=lineStart(text,excluded.keyStart),guardEnd=lineEnd(text,excluded.end);
  const guard=text.slice(guardStart,guardEnd);
  if(!unique(text,guard))return null;
  edits.push({before:guard,after:guard,hunk:hunk(guard,guard)});
  for(const key of ['confirmedCount','remaining','execution']){
   if(isDeepStrictEqual(current[key],after[key]))continue;
   const member=members.get(key);if(!member)return null;
   const start=lineStart(text,member.keyStart),end=lineEnd(text,member.end),old=text.slice(start,end);
   if(!old.startsWith('  '+JSON.stringify(key)+': ')||!unique(text,old))return null;
   const value=JSON.stringify(after[key],null,2).split('\n').join('\n  ');
   const next=old.slice(0,member.start-start)+value+old.slice(member.end-start);
   edits.push({before:old,after:next,hunk:hunk(old,next)});
  }
  if(appended){
   const member=members.get('records'),elements=member&&arrayElements(text,member);
   if(!elements)return null;
   const newLines=JSON.stringify(after.records.at(-1),null,2).split('\n').map(line=>'    '+line);
   if(!elements.length){
    const start=lineStart(text,member.keyStart),end=lineEnd(text,member.end),old=text.slice(start,end);
    if(!/^  "records": \[\],?$/.test(old)||!unique(text,old))return null;
    const next='  "records": [\n'+newLines.join('\n')+'\n  ]'+(old.endsWith(',')?',':'');
    edits.push({before:old,after:next,hunk:hunk(old,next)});
   }else{
    const last=elements.at(-1),lines=text.split('\n');
    const startLine=text.slice(0,lineStart(text,last.start)).split('\n').length-1;
    const lastLine=text.slice(0,lineStart(text,last.end-1)).split('\n').length-1;
    const closeLine=text.slice(0,lineStart(text,member.end-1)).split('\n').length-1;
    if(text.slice(lineStart(text,member.keyStart),lineEnd(text,member.start))!=='  "records": ['
     ||!/^  \],?$/.test(lines[closeLine])||text[last.end-1]!=='}'
     ||!/^\s*$/.test(text.slice(last.end,lineStart(text,member.end-1))))return null;
    let from=lastLine,old=lines.slice(from,closeLine+1).join('\n');
    while(!unique(text,old)&&from>startLine)old=lines.slice(--from,closeLine+1).join('\n');
    if(!unique(text,old))return null;
    const offset=last.end-lineStart(text,last.end-1),line=lines[lastLine];
    const amended=line.slice(0,offset)+','+line.slice(offset);
    const prefix=lines.slice(from,lastLine),suffix=lines.slice(lastLine+1,closeLine+1);
    const next=[...prefix,amended,...newLines,...suffix].join('\n');
    edits.push({before:old,after:next,hunk:'@@\n'+prefix.map(line=>' '+line+'\n').join('')
     +'-'+line+'\n+'+amended+'\n'+newLines.map(line=>'+'+line+'\n').join('')+suffix.map(line=>' '+line+'\n').join('')});
   }
  }
  for(const edit of edits)edit.start=('\n'+text+'\n').indexOf('\n'+edit.before+'\n');
  edits.sort((left,right)=>left.start-right.start);
  for(let i=1;i<edits.length;i++)if(edits[i-1].start+edits[i-1].before.length>edits[i].start)return null;
  let applied=text;
  for(const edit of edits){
   if(!unique(applied,edit.before))return null;
   const at=('\n'+applied+'\n').indexOf('\n'+edit.before+'\n');
   applied=applied.slice(0,at)+edit.after+applied.slice(at+edit.before.length);
  }
  return isDeepStrictEqual(JSON.parse(applied),after)?edits.map(edit=>edit.hunk).join(''):null;
 }catch{return null;}
}
