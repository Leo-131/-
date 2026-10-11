import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {planWorkspace,compactPlan,extractRows,executionPacket} from '../scripts/plan-workspace-round.mjs';
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outreach-preflight-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const candidateFile=path.join(dir,'provider.json');
  const sources={'autonomous-outreach-results.js':'AUTONOMOUS_OUTREACH_RESULTS',
    'linkedin-connection-results-latest.js':'LINKEDIN_CONNECTION_RESULTS_LATEST',
    'daily-automation-execution-latest.js':'DAILY_AUTOMATION_EXECUTION_LATEST',
    'google-lead-discovery-latest.js':'GOOGLE_LEAD_DISCOVERY_LATEST'};
  for(const [file,global] of Object.entries(sources))fs.writeFileSync(path.join(dir,file),'window.'+global+'=[];');
  fs.writeFileSync(candidateFile,JSON.stringify({candidates:[{company:'Old'},{company:'Failed'},{company:'Outdoor retailer',domain:'new.test',rawHugeField:'ignore'}]}));
  fs.writeFileSync(path.join(dir,'autonomous-outreach-results.js'),'window.AUTONOMOUS_OUTREACH_RESULTS=[{"company":"Old","status":"sent_confirmed"}];');
  fs.writeFileSync(path.join(dir,'research-failed.json'),JSON.stringify({company:'Failed',retryWithoutNewEvidence:false,status:'source_failed'}));
  return {candidateFile,researchDir:dir,historyDir:dir};
}
test('one-command preflight reads union history and single-company cache, without generated plans',t=>{
  const input=fixture(t);
  fs.writeFileSync(path.join(input.researchDir,'research-provider-preflight-test.json'),JSON.stringify({rows:[{company:'Outdoor retailer',status:'sent_confirmed'}]}));
  const plan=planWorkspace(input);
  assert.deepEqual(plan.rows.map(r=>r.company),['Outdoor retailer']);
  assert.deepEqual(plan.counts,{historical:1,duplicate:0,parked:1});
  assert.equal(plan.inputs.filesRead,6);assert.equal(plan.modelCalls,0);
  assert.equal(plan.sendPerformed,false);assert.equal(plan.requiresLiveVerification,true);
  assert.equal(plan.transport,'iab');assert.equal(plan.batchWaitMs,0);
  assert.equal(compactPlan(plan).rows[0].rawHugeField,undefined);
});
test('missing or malformed history/cache fails closed rather than returning new prospects',t=>{
  const input=fixture(t);
  fs.writeFileSync(path.join(input.historyDir,'linkedin-connection-results-latest.js'),'window.WRONG=[];');
  assert.throws(()=>planWorkspace(input),/Missing history global/);
  fs.writeFileSync(path.join(input.historyDir,'linkedin-connection-results-latest.js'),'window.LINKEDIN_CONNECTION_RESULTS_LATEST=[];');
  fs.writeFileSync(path.join(input.researchDir,'research-failed.json'),'{broken');
  assert.throws(()=>planWorkspace(input),SyntaxError);
});
test('every invocation sees new permanent receipts and snapshot digest changes',t=>{
  const input=fixture(t),first=planWorkspace(input);
  fs.writeFileSync(path.join(input.historyDir,'autonomous-outreach-results.js'),'window.AUTONOMOUS_OUTREACH_RESULTS=[{"company":"Outdoor retailer","status":"send_unconfirmed"}];');
  const next=planWorkspace(input);
  assert.notEqual(next.inputs.snapshotDigest,first.inputs.snapshotDigest);
  assert.ok(!next.rows.some(r=>r.company==='Outdoor retailer'));
  assert.equal(next.sendPerformed,false);
});
test('row extraction accepts arrays and known envelopes but never turns a summary into evidence',()=>{
  for(const value of [[{company:'A'}],{records:[{company:'A'}]},{candidates:[{company:'A'}]},{rows:[{company:'A'}]},{company:'A'}])assert.equal(extractRows(value)[0].company,'A');
  assert.throws(()=>extractRows({confirmed:100}),/No supported/);
});

test('provider organizations map into the same history locks without inventing evidence',t=>{
  const input=fixture(t);
  const raw={organizations:[{name:'Old renamed',primary_domain:'old.test',website_url:'https://old.test',id:'provider-a',parentCompany:'Old'},
    {name:'Outdoor Retailer',primary_domain:'new.test',website_url:'https://new.test',id:'provider-b',aliases:['Shop alias']}]};
  fs.writeFileSync(input.candidateFile,JSON.stringify(raw));
  const plan=planWorkspace(input);
  assert.equal(plan.counts.historical,1);assert.equal(plan.rows.length,1);
  assert.equal(plan.rows[0].company,'Outdoor Retailer');assert.equal(plan.rows[0].domain,'new.test');
  assert.equal(plan.rows[0].providerId,'provider-b');assert.deepEqual(plan.rows[0].aliases,['Shop alias']);
  assert.equal(plan.rows[0].icpScore,undefined);assert.equal(plan.rows[0].publicEmail,undefined);
  assert.equal(plan.sendPerformed,false);assert.equal(plan.requiresLiveVerification,true);
  assert.deepEqual(raw.organizations[1],{name:'Outdoor Retailer',primary_domain:'new.test',website_url:'https://new.test',id:'provider-b',aliases:['Shop alias']});
  assert.throws(()=>extractRows({organizations:[null]}),/Invalid organization/);
});

test('routine CLI defaults to twenty rows after full preflight, with explicit full audit available',t=>{
  const input=fixture(t);
  fs.writeFileSync(input.candidateFile,JSON.stringify({candidates:Array.from({length:100},(_,i)=>({company:'Retail '+i}))}));
  const args=[fileURLToPath(new URL('../scripts/plan-workspace-round.mjs',import.meta.url)),
    '--candidates',input.candidateFile,'--research-dir',input.researchDir,'--history-dir',input.historyDir];
  const packet=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
  const full=JSON.parse(execFileSync(process.execPath,[...args,'--compact'],{encoding:'utf8'}));
  assert.equal(packet.inputs.candidateRows,100);assert.equal(packet.rows.length,20);
  assert.equal(packet.packet.totalPending,100);assert.equal(packet.packet.eligibleToSend,false);
  assert.equal(full.rows.length,100);assert.equal(packet.inputs.snapshotDigest,full.inputs.snapshotDigest);
  // A packet includes live-verification tasks; compare the bounded row payload,
  // not its safety metadata against a deliberately name-only audit fixture.
  assert.ok(Buffer.byteLength(JSON.stringify(packet.rows))<Buffer.byteLength(JSON.stringify(full.rows)));
  const small=JSON.parse(execFileSync(process.execPath,[...args,'--packet-size','10'],{encoding:'utf8'}));
  assert.equal(small.rows.length,10);
  assert.equal(executionPacket(full).rows.length,20);
});
test('execution packets bound output without changing safety or losing pending totals',()=>{
  const plan={rows:Array.from({length:87},(_,i)=>({company:'Retailer '+i,domain:i+'.test',rawHugeField:'private'})),
    counts:{historical:1,duplicate:0,parked:12},sendPerformed:false,requiresLiveVerification:true,
    transport:'iab',modelCalls:0,inputs:{snapshotDigest:'fresh'}};
  const packet=executionPacket(plan,10);
  assert.equal(packet.rows.length,10);assert.equal(packet.packet.totalPending,87);
  assert.equal(packet.packet.deferred,77);assert.equal(packet.packet.eligibleToSend,false);
  assert.equal(packet.packet.refreshBeforeNextPacket,true);assert.equal(packet.rows[0].rawHugeField,undefined);
  assert.deepEqual(packet.counts,plan.counts);assert.equal(packet.inputs.snapshotDigest,'fresh');
  assert.equal(packet.sendPerformed,false);assert.equal(packet.requiresLiveVerification,true);
  assert.equal(plan.rows.length,87);
  for(const size of [0,-1,101,NaN,1.5])assert.throws(()=>executionPacket(plan,size),/Packet size/);
  assert.equal(executionPacket({...plan,rows:[]},10).packet.returned,0);
});
