// Synthetic local planner measurement. No browser, network, models or sends.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {planRound,identityKeys} from './plan-outreach-round.mjs';
const e=globalThis.OutreachEfficiency,g=globalThis.OutreachQueueGuard;
const candidates=Array.from({length:4000},(_,i)=>({company:`Company ${i}`,domain:`company-${i}.test`,
 aliases:[`Alias ${i}`],description:'Outdoor retail distribution'}));
const history=candidates.slice(0,3900).map(row=>({...row,status:'sent_confirmed'}));
const research=candidates.map(row=>({...row,sources:[`https://${row.domain}/contact`],email:`info@${row.domain}`}));
function previous(){const index=g.build(history,identityKeys);return e.researchPlan(candidates,
 {keys:identityKeys,blocked:row=>g.blocked(row,index,identityKeys),research,limit:100});}
function current(){return planRound({candidates,research,history});}
assert.deepEqual(current().rows,previous().rows);assert.deepEqual(current().counts,previous().counts);
previous();current();const before=[],after=[];
function measure(fn,output){const start=performance.now();fn();output.push(performance.now()-start);}
for(let i=0;i<8;i++){if(i%2){measure(current,after);measure(previous,before);}else{measure(previous,before);measure(current,after);}}
const median=a=>{const s=a.toSorted((x,y)=>x-y);return (s[3]+s[4])/2;};
const old=median(before),next=median(after);
console.log(JSON.stringify({scope:'synthetic local planner only, not end-to-end outreach',
 candidates:candidates.length,researchRows:research.length,previousMedianMs:+old.toFixed(2),
 currentMedianMs:+next.toFixed(2),speedup:+(old/next).toFixed(2),equivalentQueue:true,
 sendPerformed:false,modelCalls:0}));
