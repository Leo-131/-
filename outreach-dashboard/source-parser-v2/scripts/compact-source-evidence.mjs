// Read-only routing aid for already collected source output. No network/model/browser calls.
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const patterns = {
  product: /power.?bank|portable|camping|outdoor|pump|lantern|charg(?:er|ing)|travel|battery|batteries/i,
  role: /retail|distribut|wholesal|reseller|supplier|manufactur|integrat|install|CCTV|security|service|trading/i,
  contact: /[\w.+-]+@[\w.-]+\.[a-z]{2,}|contact us|partner with|vendor|procurement/i,
  region: /Dubai|Emirates|Qatar|Kuwait|Vietnam|Indonesia|Sharjah|Abu Dhabi|Doha/i
};

export function compactSourceEvidence(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw Error('Nonempty collected source text required');
  // Tool batches may flatten both separators and numbered lines. Keep each
  // original source isolated so a failed fetch cannot erase adjacent evidence.
  // Short dashed strings inside product descriptions are not source boundaries.
  const blocks=raw.split(/\r?\n-{10,}\r?\n|-{20,}/).filter(b=>b.trim());
  const sources=blocks.map(block=>{
    const lines=block.replace(/\s+(?=L\d+:)/g,'\n').split(/\r?\n/);
    const header=lines.find(l=>l.trim())?.slice(0,260);
    const reference=block.match(/turn\d+(?:view|search|fetch)\d+/)?.[0]??null;
    const sourceLine=lines.find(l=>/Source: (?:open|click|find)\(/.test(l));
    const sourceUrl=sourceLine?.match(/"ref_id"\s*:\s*"(https?:[^"\s]+)"/)?.[1]??null;
    const failed=/^Internal Error|is not accessible via this tool|Failed to fetch|HTTP (?:4\d\d|5\d\d)/im.test(block);
    const evidence={},seen=new Set();
    if (!failed) for(const [kind,pattern] of Object.entries(patterns)) {
      evidence[kind]=[];
      for (const line of lines) {
        // Only rendered, numbered source lines; navigation alone is not a fact.
        if (!/^L\d+:/.test(line)||!pattern.test(line)) continue;
        const clean=line.replace(/[^]*/g,'').trim();
        if (/^L\d+:\s*(?:\*|Menu$|\[Input|\[Button)/.test(clean)) continue;
        const text=clean.replace(/^L\d+:\s*/, '');
        if (text.length<12 && !/@/.test(text)) continue;
        if (seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());evidence[kind].push(clean.slice(0,240));
        if (evidence[kind].length===3) break;
      }
      if (!evidence[kind].length) delete evidence[kind];
    }
    return {header,reference,sourceUrl,status:failed?'source_failed':'review_required',
      ...(failed?{next:'persist-failure-and-switch-no-repeat-without-new-evidence'}:{evidence})};
  });
  return {format:'source-evidence-lean-v1',sourceCount:sources.length,
    rawSha256:crypto.createHash('sha256').update(raw).digest('hex'),
    rawChars:raw.length,sources,lossy:true,eligibleToSend:false,modelCalls:0,
    contract:'Routing only. Keep original collected output. Missing summary fields do not establish absence, product mismatch, geography or contact validity. Review the original source before qualification; all live send gates remain required.'};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  let raw='';
  for await (const chunk of process.stdin) raw+=chunk;
  console.log(JSON.stringify(compactSourceEvidence(raw)));
}
