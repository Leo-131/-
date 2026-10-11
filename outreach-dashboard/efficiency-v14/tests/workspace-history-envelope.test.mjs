import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planWorkspace} from '../scripts/plan-workspace-round.mjs';
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

