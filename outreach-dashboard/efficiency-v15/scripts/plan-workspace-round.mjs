// Read-only local preflight. Never controls a browser, calls a model or sends mail.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {planRound} from './plan-outreach-round.mjs';

const historyFiles = {
  'autonomous-outreach-results.js':'AUTONOMOUS_OUTREACH_RESULTS',
  'linkedin-connection-results-latest.js':'LINKEDIN_CONNECTION_RESULTS_LATEST',
  'daily-automation-execution-latest.js':'DAILY_AUTOMATION_EXECUTION_LATEST',
  'google-lead-discovery-latest.js':'GOOGLE_LEAD_DISCOVERY_LATEST'
};
export function extractRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') throw Error('Invalid row container');
  for (const key of ['records','candidates','rows']) if (Array.isArray(value[key])) return value[key];
  // Shallow organization results are discovery metadata, never verified evidence.
  // Preserve explicit aliases/groups while mapping provider spelling once.
  if (Array.isArray(value.organizations)) return value.organizations.map(row=> {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Invalid organization row');
    return {...row,company:row.company || row.name,
      domain:row.domain || row.primary_domain,
      website:row.website || row.website_url,
      providerId:row.providerId || row.id};
  });
  if (value.company || value.domain || value.companyName) return [value];
  throw Error('No supported row container');
}
// Pure data exports avoid creating a VM. Legacy executable exports retain the
// original isolated evaluation; a wrong global must still fail closed.
export function parseHistoryExport(source, global) {
  const match=source.match(/^\s*window\.([A-Z_]+)\s*=\s*([\s\S]*?)\s*;?\s*$/);
  if(match && match[1]===global) {
    try { return {value:JSON.parse(match[2]),mode:'json'}; } catch {}
  }
  const context={};context.window=context;
  vm.runInNewContext(source,context,{timeout:1000});
  return {value:context[global],mode:'vm'};
}
const selectedResearch=directory=>fs.readdirSync(directory).filter(name=>
  /^(?:research-(?!provider-preflight)|october-research-).*\.json$/.test(name)
  || /-send-attempt-.*\.json$/.test(name)).sort();
export function planWorkspace(options) {
  return planWorkspaceRead(options,filename=>fs.readFileSync(filename),selectedResearch(options.researchDir));
}
function planWorkspaceRead({candidateFile,candidateFiles,researchDir,historyDir,limit=100},readBytes,selected) {
  const started=performance.now(), hashes=[], files=new Set();
  function read(filename) {
    const absolute=path.resolve(filename);
    if (files.has(absolute)) throw Error('Duplicate input file');
    files.add(absolute);
    const bytes=readBytes(absolute);
    hashes.push([path.basename(absolute),crypto.createHash('sha256').update(bytes).digest('hex')]);
    return bytes.toString('utf8').replace(/^\uFEFF/,'');
  }
  const inputs=candidateFiles ?? [candidateFile];
  if(!Array.isArray(inputs)||!inputs.length||inputs.some(file=>typeof file!=='string'||!file))
    throw Error('At least one candidate file is required');
  const candidates=inputs.flatMap(file=>extractRows(JSON.parse(read(file))));
  const research=[];
  // Deliberately exclude generated preflight/provider output: it is not research evidence.
  if (!selected.length) throw Error('No research cache files: refusing incomplete preflight');
  for (const name of selected) {
    const filename=path.join(researchDir,name);
    const value=JSON.parse(read(filename));
    // Some historical cache manifests contain only statistics; skip them explicitly.
    if (!Array.isArray(value) && !['records','candidates','rows'].some(k=>Array.isArray(value?.[k]))
        && !value?.company && !value?.domain && !value?.companyName) continue;
    research.push(...extractRows(value));
  }
  const inputReadEnd=performance.now();
  const history=[],historyParseModes={json:0,vm:0};
  for (const [filename,global] of Object.entries(historyFiles)) {
    const parsed=parseHistoryExport(read(path.join(historyDir,filename)),global);
    historyParseModes[parsed.mode]++;
    // Preserve the actual named global; never silently accept a missing history source.
    const rows=parsed.value;
    if (!rows) throw Error('Missing history global: '+global);
    if (Array.isArray(rows)) history.push(...rows);
    else if (typeof rows==='object') {
      const arrays=Object.values(rows).filter(Array.isArray);
      if (!arrays.length) throw Error('No history arrays: '+global);
      history.push(...arrays.flat().filter(row=>row&&typeof row==='object'&&!Array.isArray(row)));
    } else throw Error('Invalid history: '+global);
  }
  const historyEnd=performance.now();
  const plan=planRound({candidates,research,history,limit});
  const planEnd=performance.now();
  return {...plan,inputs:{candidateRows:candidates.length,candidateFiles:inputs.length,researchRows:research.length,
    historyRows:history.length,filesRead:files.size,researchFiles:selected.length,
    snapshotDigest:crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex')},
    localPreflightMs:Math.round((planEnd-started)*100)/100,
    localTimingMs:{candidateAndResearch:Math.round((inputReadEnd-started)*100)/100,
      history:Math.round((historyEnd-inputReadEnd)*100)/100,
      planning:Math.round((planEnd-historyEnd)*100)/100},historyParseModes,
    timingScope:'Local reads and deterministic preflight only; not end-to-end outreach'};
}
// Fresh bounded I/O, not a reusable snapshot cache. Only local reads run in
// parallel; planning and every irreversible outreach action remain serial.
export async function planWorkspaceAsync(options) {
  const started=performance.now(),selected=selectedResearch(options.researchDir);
  const candidates=options.candidateFiles??[options.candidateFile];
  if(!Array.isArray(candidates)||!candidates.length||candidates.some(x=>typeof x!=='string'||!x))
    throw Error('At least one candidate file is required');
  const filenames=[...candidates,...selected.map(name=>path.join(options.researchDir,name)),
    ...Object.keys(historyFiles).map(name=>path.join(options.historyDir,name))].map(x=>path.resolve(x));
  if(new Set(filenames).size!==filenames.length)throw Error('Duplicate input file');
  const bytes=new Map();let cursor=0;
  await Promise.all(Array.from({length:Math.min(16,filenames.length)},async()=>{
    while(cursor<filenames.length){const filename=filenames[cursor++];
      bytes.set(filename,await fs.promises.readFile(filename));}
  }));
  const prefetchEnd=performance.now();
  const result=planWorkspaceRead(options,filename=>{
    if(!bytes.has(filename))throw Error('Missing fresh input');return bytes.get(filename);
  },selected);
  return {...result,localPreflightMs:Math.round((performance.now()-started)*100)/100,
    localTimingMs:{prefetch:Math.round((prefetchEnd-started)*100)/100,...result.localTimingMs},
    inputReadMode:'fresh-bounded-parallel-16-no-persistent-cache'};
}
export function compactPlan(plan) {
  return {...plan,rows:plan.rows.map(row=>Object.fromEntries(
    ['company','name','domain','website','websiteUrl','group','groupName','parentCompany',
      'aliases','companyAliases','groupAliases','providerId','evidenceRevision','evidenceSources','cachedResearch',
      'country','countryMarket','industry','description','keywords','role']
      .filter(key=>row[key]!==undefined).map(key=>[key,
        ['description','industry','role'].includes(key)?String(row[key]).slice(0,240):
        key==='keywords'?(Array.isArray(row[key])?row[key].filter(x=>typeof x==='string').slice(0,8).map(x=>x.slice(0,80)):[]):row[key]])))};
}
// Small research-only execution packet. Always regenerate from fresh history;
// never use an offset/checkpoint to bypass newly recorded company/group locks.
export function executionPacket(plan, size=10, tasksOnly=false) {
  if (!Number.isInteger(size) || size<1 || size>100) throw Error('Packet size must be an integer from 1 to 100');
  // Compact only the current packet. Deferred rows are counted, not inspected or
  // serialized again; the complete preflight above still sees every input lock.
  const totalPending=plan.rows.length;
  const compact=compactPlan({...plan,rows:plan.rows.slice(0,size)});
  const packet = {...compact,rows:compact.rows,
    researchTasks:compact.rows.map(row=>globalThis.OutreachEfficiency.verificationTask(row)),
    researchPolicy:globalThis.OutreachEfficiency.researchPolicy,
    packet:{totalPending,returned:compact.rows.length,
      deferred:Math.max(0,totalPending-size),refreshBeforeNextPacket:true,
      eligibleToSend:false}};
  if (tasksOnly) {
    // Avoid sending the same source/contact context twice to the executor.
    // Preserve exact identities for live CRM/mailbox checks, not send approval.
    packet.researchTasks = packet.researchTasks.map((task,i)=>({...task,
      identity:identityForTask(packet.rows[i])}));
    delete packet.rows;
    packet.packet.format='research-tasks-only';
  }
  return packet;
}
function identityForTask(row) {
  return Object.fromEntries(['domain','website','websiteUrl','group','groupName','parentCompany',
    'aliases','companyAliases','groupAliases','providerId'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),options={candidateFiles:[]};let compact=false,packetSize,tasksOnly=false;
  for (let i=0;i<args.length;i++) {
    if(args[i]==='--compact'){compact=true;continue;}
    if(args[i]==='--tasks-only'){tasksOnly=true;continue;}
    if(args[i]==='--packet-size'){packetSize=Number(args[++i]);continue;}
    const key={'--candidates':'candidateFile','--research-dir':'researchDir','--history-dir':'historyDir','--limit':'limit'}[args[i]];
    if(!key || !args[i+1] || args[i+1].startsWith('--'))throw Error('Use --candidates file --research-dir directory --history-dir directory [--limit 100] [--compact]');
    if(key==='candidateFile')options.candidateFiles.push(args[++i]);
    else options[key]=key==='limit'?Number(args[++i]):args[++i];
  }
  if (!options.candidateFiles.length||!options.researchDir||!options.historyDir)throw Error('All three input sources are required');
  if (tasksOnly && compact) throw Error('--tasks-only cannot be combined with --compact');
  const plan=await planWorkspaceAsync(options);
  // Normal executions emit only the next research packet. --compact explicitly
  // retains the full pending queue for audit/export, not routine execution.
  console.log(JSON.stringify(packetSize!==undefined?executionPacket(plan,packetSize,tasksOnly):compact?compactPlan(plan):executionPacket(plan,10,tasksOnly)));
}
