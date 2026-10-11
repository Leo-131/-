// Synthetic local planner comparison. No file writes, models, browser or sends.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {planRound,identityKeys} from './plan-outreach-round.mjs';
const e=globalThis.OutreachEfficiency,g=globalThis.OutreachQueueGuard;
const candidates=Array.from({length:4000},(_,i)=>({company:`Company ${i}`,
 domain:`company-${i}.test`,description:'Outdoor retail distribution '.repeat(8)}));
const history=candidates.slice(0,3900).map(r=>({...r,status:'sent_confirmed'}));
const research=candidates.map(r=>({...r,sources:[`https://${r.domain}/contact`],
 publicEmail:`info@${r.domain}`}));
function previous(){const index=g.build(history,identityKeys);
 const ordered=e.prioritizeVerification(e.prioritizeResearch(e.researchContext(candidates,research)));
 return e.researchBatch(ordered,{keys:identityKeys,blocked:r=>g.blocked(r,index,identityKeys),research});}
function current(){return planRound({candidates,history,research});}
assert.deepEqual(current().rows,previous().rows);
previous();current();const old=[],next=[];
function measure(fn,rows){const start=performance.now();fn();rows.push(performance.now()-start);}
for(let i=0;i<6;i++){if(i%2){measure(current,next);measure(previous,old);}
 else{measure(previous,old);measure(current,next);}}
const median=rows=>{const sorted=rows.toSorted((a,b)=>a-b);return (sorted[2]+sorted[3])/2;};
const oldMs=median(old),newMs=median(next);
console.log(JSON.stringify({scope:'synthetic local planner only; not end-to-end outreach',
 candidateRows:4000,historicalRows:3900,contextRowsBefore:4000,contextRowsAfter:100,
 equivalentQueue:true,previousMedianMs:Math.round(oldMs),currentMedianMs:Math.round(newMs),
 speedup:Number((oldMs/newMs).toFixed(2)),sendPerformed:false,modelCalls:0}));
