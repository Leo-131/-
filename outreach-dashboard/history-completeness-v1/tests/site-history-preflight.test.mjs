import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {planWorkspace,planWorkspaceAsync} from '../scripts/plan-workspace-round.mjs';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'site-history-preflight-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const site=path.join(dir,'site'); fs.mkdirSync(site);
  const exports={'autonomous-outreach-results.js':'AUTONOMOUS_OUTREACH_RESULTS',
    'linkedin-connection-results-latest.js':'LINKEDIN_CONNECTION_RESULTS_LATEST',
    'daily-automation-execution-latest.js':'DAILY_AUTOMATION_EXECUTION_LATEST',
    'google-lead-discovery-latest.js':'GOOGLE_LEAD_DISCOVERY_LATEST'};
  for(const [file,key]of Object.entries(exports))fs.writeFileSync(path.join(dir,file),'window.'+key+'=[];');
  fs.writeFileSync(path.join(dir,'research-empty.json'),'{"records":[]}');
  const candidateFile=path.join(dir,'candidates.json');
  fs.writeFileSync(candidateFile,JSON.stringify([{company:'Old Social'},
    {company:'Affiliate',group:'Retail Group'},{company:'Old Reply'},
    {company:'Unknown Social'},{company:'Fresh'}]));
  fs.writeFileSync(path.join(site,'browser-verified-outreach.js'),
    '(function(root){root.AUTONOMOUS_OUTREACH_RESULTS=[{company:"Old Social",status:"sent_confirmed",channel:"instagram"},{company:"Other Group Member",groupName:"Retail Group",status:"submitted_confirmed"},{company:"Unknown Social",status:"send_unconfirmed"}];})(window);');
  fs.writeFileSync(path.join(site,'september-reconciliation.js'),
    'window.SEPTEMBER_RECONCILIATION={coverage:"targeted",records:[{company:"Old Reply",status:"replied"}]};');
  return {candidateFile,researchDir:dir,historyDir:dir,siteHistoryDir:site};
}

test('site overlays close desktop-history gaps across channels, groups and unknown sends',async t=>{
  const input=fixture(t),a=planWorkspace(input),b=await planWorkspaceAsync(input);
  assert.deepEqual(a.rows.map(r=>r.company),['Fresh']);
  assert.deepEqual(b.rows.map(r=>r.company),['Fresh']);
  assert.equal(a.counts.historical,4);assert.equal(a.inputs.historyRows,4);
  assert.equal(a.inputs.historySupplementFiles,2);
  assert.equal(a.sendPerformed,false);assert.equal(a.requiresLiveVerification,true);
  assert.equal(input.historySupplements,undefined);
  assert.equal(a.inputs.snapshotDigest,b.inputs.snapshotDigest);
});

test('site history is reread and a new receipt cannot be bypassed by earlier packet',async t=>{
  const input=fixture(t),before=await planWorkspaceAsync(input);
  fs.appendFileSync(path.join(input.siteHistoryDir,'browser-verified-outreach.js'),
    'window.AUTONOMOUS_OUTREACH_RESULTS.push({company:"Fresh",status:"send_unconfirmed"});');
  const after=await planWorkspaceAsync(input);
  assert.equal(after.rows.length,0);assert.equal(after.counts.historical,5);
  assert.notEqual(before.inputs.snapshotDigest,after.inputs.snapshotDigest);
});

test('missing or malformed known site overlay fails closed; empty named array is not a receipt',async t=>{
  const input=fixture(t),file=path.join(input.siteHistoryDir,'browser-verified-outreach.js');
  fs.writeFileSync(file,'window.WRONG=[];');
  assert.throws(()=>planWorkspace(input),/retain actual historical rows/);
  fs.writeFileSync(file,'window.AUTONOMOUS_OUTREACH_RESULTS=[];');
  const empty=planWorkspace(input);assert.equal(empty.inputs.historyRows,1);
  fs.unlinkSync(file);
  await assert.rejects(planWorkspaceAsync(input),/ENOENT/);
});

test('explicit overlay supplements are not read twice and CLI requires the site history',t=>{
  const input=fixture(t);
  const duplicate={...input,historySupplements:[path.join(input.siteHistoryDir,'browser-verified-outreach.js')]};
  assert.equal(planWorkspace(duplicate).inputs.historySupplementFiles,2);
  const args=[fileURLToPath(new URL('../scripts/plan-workspace-round.mjs',import.meta.url)),
    '--candidates',input.candidateFile,'--research-dir',input.researchDir,
    '--history-dir',input.historyDir,'--site-history-dir',input.siteHistoryDir];
  const packet=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
  assert.deepEqual(packet.researchTasks.map(r=>r.company),['Fresh']);
  assert.equal(packet.inputs.historySupplementFiles,2);assert.equal(packet.sendPerformed,false);
  if(fs.existsSync(fileURLToPath(new URL('../web/browser-verified-outreach.js',import.meta.url)))) {
    const routine=JSON.parse(execFileSync(process.execPath,args.slice(0,-2),{encoding:'utf8'}));
    assert.equal(routine.inputs.historySupplementFiles,2);
    assert.equal(routine.sendPerformed,false);assert.equal(routine.requiresLiveVerification,true);
  } else {
    // The public code-only package deliberately excludes private customer data.
    assert.throws(()=>execFileSync(process.execPath,args.slice(0,-2),{encoding:'utf8',stdio:'pipe'}),/ENOENT/);
  }
});
