import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const file='autonomous-outreach-results.js';
const global='AUTONOMOUS_OUTREACH_RESULTS';
export function createLedgerChunks(data,{maxRecords=128,maxBytes=128*1024}={}){
 if(!Array.isArray(data))throw Error('Ledger must remain a complete array');
 if(!Number.isSafeInteger(maxRecords)||maxRecords<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Invalid chunk limits');
 const hash=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const chunks=[];let records=[],start=0;
 const render=(rows,index,end)=>'(function(){'+(index?'if(window.__outreachLedgerChunkState?.hash!=='+JSON.stringify(hash)+'||window.__outreachLedgerChunkState?.index!=='+(index-1)+')throw Error("Ledger chunk order");window.'+global+'.push(...'+JSON.stringify(rows)+');':'window.'+global+'='+JSON.stringify(rows)+';')+'window.__outreachLedgerChunkState={hash:'+JSON.stringify(hash)+',index:'+index+',rows:'+end+'};}());';
 const append=()=>{const index=chunks.length,end=start+records.length,source=render(records,index,end);if(Buffer.byteLength(source)>maxBytes)throw Error('Ledger chunk wrapper exceeds byte limit');chunks.push({file:'generated-data/'+hash+'/part-'+String(index).padStart(3,'0')+'.js',source,index,records:records.length,end});start=end;records=[];};
 for(const record of data){
  const candidate=[...records,record];
  if(records.length&&(candidate.length>maxRecords||Buffer.byteLength(render(candidate,chunks.length,start+candidate.length))>maxBytes))append();
  if(Buffer.byteLength(render([...records,record],chunks.length,start+records.length+1))>maxBytes)throw Error('Complete ledger record exceeds chunk byte limit');
  records.push(record);
 }
 if(records.length||!chunks.length)append();
 return {file,global,hash,rows:data.length,chunks};
}

export function replaceLedgerPlaceholder(html,bundle){
 let replaced=0;
 const output=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,tag=>{
  if(!/\bdata-hosted-script\b/.test(tag))return tag;
  const src=tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);if(!src)return tag;
  if(new URL(src[2],'https://build.invalid/').pathname!=='/'+file)return tag;
  replaced++;
  return bundle.chunks.map(chunk=>'<script type="text/plain" data-hosted-script data-progress-file="'+file+'" data-record-hash="'+bundle.hash+'" data-record-chunk="'+chunk.index+'" data-record-chunks="'+bundle.chunks.length+'" data-record-end="'+chunk.end+'" data-record-total="'+bundle.rows+'" src="./'+chunk.file+'"></script>').join('\n');
 });
 if(replaced!==1)throw Error('Expected exactly one required ledger placeholder');
 return output;
}

export function writeLedgerChunks(client,bundle){
 const base=path.resolve(client),generated=path.resolve(base,'generated-data');
 if(path.relative(base,generated)!=='generated-data'||fs.lstatSync(base).isSymbolicLink()||path.relative(base,fs.realpathSync(base))!=='')throw Error('Unsafe generated output directory or symlink');
 if(!/^[a-f0-9]{64}$/.test(bundle.hash)||!Array.isArray(bundle.chunks)||!bundle.chunks.length)throw Error('Unsafe generated chunk manifest');
 const outputs=bundle.chunks.map(chunk=>{const filename=path.resolve(base,chunk.file);if(!Number.isSafeInteger(chunk.index)||chunk.index<0||path.relative(generated,path.dirname(filename))!==bundle.hash||path.basename(filename)!=='part-'+String(chunk.index).padStart(3,'0')+'.js')throw Error('Unsafe generated chunk path');return {filename,source:chunk.source};});
 const owned=[];
 let generatedStat;try{generatedStat=fs.lstatSync(generated);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(generatedStat){
  if(generatedStat.isSymbolicLink()||!generatedStat.isDirectory())throw Error('Generated output refuses symbolic link');
  for(const hash of fs.readdirSync(generated)){
   const directory=path.join(generated,hash),stat=fs.lstatSync(directory);
   if(!/^[a-f0-9]{64}$/.test(hash)||stat.isSymbolicLink()||!stat.isDirectory())throw Error('Unknown generated output content or symlink');
   const files=[];
   for(const name of fs.readdirSync(directory)){
    const filename=path.join(directory,name),entry=fs.lstatSync(filename),index=name.match(/^part-(\d{3,})\.js$/);
    if(!index||entry.isSymbolicLink()||!entry.isFile())throw Error('Unknown generated chunk content or symlink');
    const source=fs.readFileSync(filename,'utf8'),marker=source.match(/window\.__outreachLedgerChunkState=\{hash:"([a-f0-9]{64})",index:(\d+),rows:(\d+)\};\}\(\)\);$/);
    if(!source.startsWith('(function(){')||!marker||marker[1]!==hash||Number(marker[2])!==Number(index[1]))throw Error('Unknown generated chunk wrapper');
    files.push(filename);
   }
   owned.push({directory,files});
  }
  // Validate every owned path before removing any file; never recurse into unknown content.
  for(const entry of owned){for(const filename of entry.files)fs.unlinkSync(filename);fs.rmdirSync(entry.directory);}
  fs.rmdirSync(generated);
 }
 for(const {filename,source} of outputs){
  fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,source);
 }
}
