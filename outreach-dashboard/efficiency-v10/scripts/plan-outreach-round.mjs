// Offline preflight only: one read per input, no network, model calls or sends.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import '../web/outreach-efficiency.js';
import '../web/outreach-queue-guard.js';
export const identityKeys = globalThis.OutreachEfficiency.identityKeys;
export function planRound({candidates=[],research=[],history=[],limit=100}) {
  const guard=globalThis.OutreachQueueGuard;
  const index=guard.build(history,identityKeys);
  const efficiency=globalThis.OutreachEfficiency;
  // Screen all immutable locks before joining/serializing cached source details.
  // Do not deduplicate here: ordering must still choose the best alias seed.
  const screened=efficiency.researchBatch(candidates,{
    keys:identityKeys,blocked:row=>guard.blocked(row,index,identityKeys),research,screenOnly:true
  });
  const ordered=efficiency.prioritizeVerification(efficiency.prioritizeResearch(
    efficiency.researchContext(screened.rows,research)));
  const plan=globalThis.OutreachEfficiency.researchBatch(ordered,{
    keys:identityKeys,blocked:row=>guard.blocked(row,index,identityKeys),research,limit
  });
  return {...plan,counts:{historical:screened.counts.historical+plan.counts.historical,
    parked:screened.counts.parked+plan.counts.parked,duplicate:plan.counts.duplicate},
    preflightWork:{candidateRows:candidates.length,contextRows:screened.rows.length,
      skippedContextRows:candidates.length-screened.rows.length},
    transport:'iab',emailTemplate:'营销模板2',modelCalls:0,
    researchOrdering:'cached-evidence-first-then-product-and-channel-not-ICP',
    liveChecksStillRequired:['daily-agency-table','official-public-contact','ICP>70',
      'current-product-fit','live-CRM-group-dedup','mailbox-all-folders-and-recipient-dedup'],
    execution:'serial-single-send-confirm-receipt-write-permanent-record',batchWaitMs:0};
}
function readRows(filename) {
  const text=fs.readFileSync(filename,'utf8');
  const raw=text.match(/^\s*window\.[A-Z_]+\s*=\s*([\s\S]*?)\s*;?\s*$/)?.[1] || text;
  const value=JSON.parse(raw);
  const rows=Array.isArray(value) ? value : value.records || value.candidates || value.rows;
  if(!Array.isArray(rows))throw Error('Input must contain a records, candidates or rows array');
  return rows;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),input={candidates:[],research:[],history:[]};
  for(let i=0;i<args.length;i+=2) {
    const name=args[i].replace(/^--/,'');
    if(!['candidates','research','history','limit'].includes(name)||!args[i+1])throw Error('Use --candidates file [--research file] [--history file] [--limit 100]');
    if(name==='limit')input.limit=Number(args[i+1]);
    else input[name].push(...readRows(args[i+1]));
  }
  if(!input.candidates.length)throw Error('No candidates supplied');
  console.log(JSON.stringify(planRound(input)));
}
