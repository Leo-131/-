import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planWorkspace,planWorkspaceAsync} from '../scripts/plan-workspace-round.mjs';
test('production-style history envelopes include receipts in every array',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outreach-history-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const values={AUTONOMOUS_OUTREACH_RESULTS:[],
    LINKEDIN_CONNECTION_RESULTS_LATEST:{confirmed:[],uncertain:[{company:'Pending Company',doNotResend:true}]},
    DAILY_AUTOMATION_EXECUTION_LATEST:{skipped:[{company:'Old',status:'sent_confirmed'}],recoveryActions:['diagnostic only']},
    GOOGLE_LEAD_DISCOVERY_LATEST:{leads:[]}};
  const files=['autonomous-outreach-results.js','linkedin-connection-results-latest.js','daily-automation-execution-latest.js','google-lead-discovery-latest.js'];
  Object.entries(values).forEach(([global,value],i)=>fs.writeFileSync(path.join(dir,files[i]),'window.'+global+'='+JSON.stringify(value)+';'));
  fs.writeFileSync(path.join(dir,'research-a.json'),'{"records":[]}');
  const candidateFile=path.join(dir,'candidates.json');
  fs.writeFileSync(candidateFile,'[{"company":"Old"},{"company":"Pending Company"},{"company":"New"}]');
  const plan=planWorkspace({candidateFile,researchDir:dir,historyDir:dir});
  assert.deepEqual(plan.rows.map(r=>r.company),['New']);
  assert.equal(plan.counts.historical,2);assert.equal(plan.inputs.historyRows,2);
});

test('failed latest diagnostic requires explicit retained rows, keeps old locks and fresh receipts',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outreach-diagnostic-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const files={ 'autonomous-outreach-results.js':'AUTONOMOUS_OUTREACH_RESULTS',
    'linkedin-connection-results-latest.js':'LINKEDIN_CONNECTION_RESULTS_LATEST',
    'daily-automation-execution-latest.js':'DAILY_AUTOMATION_EXECUTION_LATEST',
    'google-lead-discovery-latest.js':'GOOGLE_LEAD_DISCOVERY_LATEST'};
  for(const [name,key]of Object.entries(files))fs.writeFileSync(path.join(dir,name),'window.'+key+'=[];');
  const daily=path.join(dir,'daily-automation-execution-latest.js');
  const failed={ok:false,error:'transport unavailable',extensionReceiptCount:0};
  fs.writeFileSync(daily,'window.DAILY_AUTOMATION_EXECUTION_LATEST='+JSON.stringify(failed)+';');
  fs.writeFileSync(path.join(dir,'research-empty.json'),'{"records":[]}');
  const candidateFile=path.join(dir,'candidates.json');
  fs.writeFileSync(candidateFile,'[{"company":"Old alias","domain":"old.test"},{"company":"Fresh"},{"company":"New"}]');
  const input={candidateFile,researchDir:dir,historyDir:dir};
  assert.throws(()=>planWorkspace(input),/No history arrays/);
  const retained=path.join(dir,'retained');fs.mkdirSync(retained);
  const snapshot=path.join(retained,'daily-automation-execution-latest.js');
  fs.writeFileSync(snapshot,'window.DAILY_AUTOMATION_EXECUTION_LATEST={records:[{company:"Old",companyDomain:"old.test",status:"sent_confirmed"}]};');
  const options={...input,historySupplements:[snapshot]};
  const a=await planWorkspaceAsync(options);
  assert.deepEqual(a.rows.map(r=>r.company),['Fresh','New']);
  fs.writeFileSync(path.join(dir,'autonomous-outreach-results.js'),'window.AUTONOMOUS_OUTREACH_RESULTS=[{company:"Fresh",status:"send_unconfirmed"}];');
  const b=await planWorkspaceAsync(options);
  assert.deepEqual(b.rows.map(r=>r.company),['New']);
  assert.notEqual(a.inputs.snapshotDigest,b.inputs.snapshotDigest);
  assert.equal(b.inputs.historySupplementFiles,1);assert.equal(b.sendPerformed,false);
  for(const value of [{ok:false,extensionReceiptCount:1},{ok:false},{ok:true,extensionReceiptCount:0}]) {
    fs.writeFileSync(daily,'window.DAILY_AUTOMATION_EXECUTION_LATEST='+JSON.stringify(value)+';');
    assert.throws(()=>planWorkspace(options),/No history arrays/);
  }
  fs.writeFileSync(daily,'window.DAILY_AUTOMATION_EXECUTION_LATEST='+JSON.stringify(failed)+';');
  fs.writeFileSync(snapshot,'window.DAILY_AUTOMATION_EXECUTION_LATEST=[];');
  assert.throws(()=>planWorkspace(options),/retain actual historical rows/);
});
