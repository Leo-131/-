// Read-only measurement: bytes are context volume, not wall-clock outreach speed.
import {planWorkspace,executionPacket} from './plan-workspace-round.mjs';
const [researchDir,historyDir,...candidateFiles]=process.argv.slice(2);
if (!researchDir || !historyDir || !candidateFiles.length) throw Error('Require researchDir historyDir candidateFiles');
const plan=planWorkspace({candidateFiles,researchDir,historyDir});
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const before=bytes(executionPacket(plan)),after=bytes(executionPacket(plan,10,true));
console.log(JSON.stringify({candidateRows:plan.inputs.candidateRows,pending:plan.rows.length,
 beforeBytes:before,afterBytes:after,reductionPercent:Math.round((1-after/before)*1000)/10,
 scope:'executor context bytes only; no end-to-end speed claim',sendPerformed:false,modelCalls:0}));
