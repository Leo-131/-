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
export function planWorkspace({candidateFile,candidateFiles,researchDir,historyDir,limit=100}) {
  const started=performance.now(), hashes=[], files=new Set();
  function read(filename) {
    const absolute=path.resolve(filename);
    if (files.has(absolute)) throw Error('Duplicate input file');
    files.add(absolute);
    const bytes=fs.readFileSync(absolute);
    hashes.push([path.basename(absolute),crypto.createHash('sha256').update(bytes).digest('hex')]);
    return bytes.toString('utf8').replace(/^\uFEFF/,'');
  }
  const inputs=candidateFiles ?? [candidateFile];
  if(!Array.isArray(inputs)||!inputs.length||inputs.some(file=>typeof file!=='string'||!file))
    throw Error('At least one candidate file is required');
  const candidates=inputs.flatMap(file=>extractRows(JSON.parse(read(file))));
  const research=[];
  // Deliberately exclude generated preflight/provider output: it is not research evidence.
  const selected=fs.readdirSync(researchDir).filter(name=>
    /^(?:research-(?!provider-preflight)|october-research-).*\.json$/.test(name)
    || /-send-attempt-.*\.json$/.test(name)).sort();
  if (!selected.length) throw Error('No research cache files: refusing incomplete preflight');
  for (const name of selected) {
    const filename=path.join(researchDir,name);
    const value=JSON.parse(read(filename));
    // Some historical cache manifests contain only statistics; skip them explicitly.
    if (!Array.isArray(value) && !['records','candidates','rows'].some(k=>Array.isArray(value?.[k]))
        && !value?.company && !value?.domain && !value?.companyName) continue;
    research.push(...extractRows(value));
  }
  const history=[];
  for (const [filename,global] of Object.entries(historyFiles)) {
    const context={};context.window=context;
    vm.runInNewContext(read(path.join(historyDir,filename)),context,{timeout:1000});
    // Preserve the actual named global; never silently accept a missing history source.
    const rows=context[global];
    if (!rows) throw Error('Missing history global: '+global);
    if (Array.isArray(rows)) history.push(...rows);
    else if (typeof rows==='object') {
      const arrays=Object.values(rows).filter(Array.isArray);
      if (!arrays.length) throw Error('No history arrays: '+global);
      history.push(...arrays.flat().filter(row=>row&&typeof row==='object'&&!Array.isArray(row)));
    } else throw Error('Invalid history: '+global);
  }
  const plan=planRound({candidates,research,history,limit});
  return {...plan,inputs:{candidateRows:candidates.length,candidateFiles:inputs.length,researchRows:research.length,
    historyRows:history.length,filesRead:files.size,researchFiles:selected.length,
    snapshotDigest:crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex')},
    localPreflightMs:Math.round((performance.now()-started)*100)/100,
    timingScope:'Local reads and deterministic preflight only; not end-to-end outreach'};
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
  const compact=compactPlan(plan);
  const packet = {...compact,rows:compact.rows.slice(0,size),
    researchTasks:compact.rows.slice(0,size).map(row=>globalThis.OutreachEfficiency.verificationTask(row)),
    researchPolicy:globalThis.OutreachEfficiency.researchPolicy,
    packet:{totalPending:compact.rows.length,returned:Math.min(size,compact.rows.length),
      deferred:Math.max(0,compact.rows.length-size),refreshBeforeNextPacket:true,
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
  const plan=planWorkspace(options);
  // Normal executions emit only the next research packet. --compact explicitly
  // retains the full pending queue for audit/export, not routine execution.
  console.log(JSON.stringify(packetSize!==undefined?executionPacket(plan,packetSize,tasksOnly):compact?compactPlan(plan):executionPacket(plan,10,tasksOnly)));
}
