import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planWorkspace,planWorkspaceAsync} from '../scripts/plan-workspace-round.mjs';
test('bounded fresh reads preserve order, digest and newly added locks',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outreach-read-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const globals={'autonomous-outreach-results.js':'AUTONOMOUS_OUTREACH_RESULTS',
 'linkedin-connection-results-latest.js':'LINKEDIN_CONNECTION_RESULTS_LATEST',
 'daily-automation-execution-latest.js':'DAILY_AUTOMATION_EXECUTION_LATEST',
 'google-lead-discovery-latest.js':'GOOGLE_LEAD_DISCOVERY_LATEST'};
 for(const [file,global]of Object.entries(globals))fs.writeFileSync(path.join(dir,file),`window.${global}=[];`);
 fs.writeFileSync(path.join(dir,'candidates.json'),JSON.stringify([{company:'A'},{company:'B'}]));
 fs.writeFileSync(path.join(dir,'research-one.json'),'[]');
 const options={candidateFile:path.join(dir,'candidates.json'),researchDir:dir,historyDir:dir};
 const sync=planWorkspace(options),asyncPlan=await planWorkspaceAsync(options);
 assert.deepEqual(asyncPlan.rows,sync.rows);assert.deepEqual(asyncPlan.inputs,sync.inputs);
 fs.writeFileSync(path.join(dir,'autonomous-outreach-results.js'),
  'window.AUTONOMOUS_OUTREACH_RESULTS=[{"company":"A","status":"send_unconfirmed"}];');
 const changed=await planWorkspaceAsync(options);
 assert.notEqual(changed.inputs.snapshotDigest,sync.inputs.snapshotDigest);
 assert.deepEqual(changed.rows.map(x=>x.company),['B']);
 await assert.rejects(planWorkspaceAsync({...options,candidateFiles:[options.candidateFile,options.candidateFile]}),/Duplicate/);
 fs.unlinkSync(path.join(dir,'research-one.json'));
 await assert.rejects(planWorkspaceAsync(options),/No research cache/);
});
