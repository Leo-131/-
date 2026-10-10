(function(root) {
  'use strict';
  function identityKeys(row) {
    const normalize=value=>String(value||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
    const known=value=>value&&!/^(unknown|unverified|待核验)$/.test(value);
    const aliases=Array.isArray(row.aliases)?row.aliases.filter(value=>typeof value==='string'):[];
    const names=[row.company,row.name,row.group,row.groupName,row.parentCompany,...aliases,
      ...(Array.isArray(row.companyAliases)?row.companyAliases:[]),
      ...(Array.isArray(row.groupAliases)?row.groupAliases:[])];
    const domains=[row.domain,row.companyDomain,row.website,row.websiteUrl,
      ...aliases.filter(value=>/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i.test(value))].map(value=>{
      if(!value)return '';
      try {const url=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
        if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';
        const host=url.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
        if(/(^|\.)(facebook\.com|instagram\.com|linkedin\.com|google\.com|wixsite\.com|amazon\.com|gmail\.com|outlook\.com)$/.test(host))return '';
        return host;
      }catch{return '';}
    }).filter(value=>known(value)&&value.includes('.'));
    // Exact recipient addresses only; never group firms by gmail/outlook.
    const emails=[row.email,row.recipientEmail,row.publicEmail,row.contactEmail,row.publicBusinessEmail]
      .map(normalize).filter(value=>/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value));
    return [...new Set([
      ...names.map(normalize).filter(known).map(value=>'entity:'+value),
      ...domains.map(value=>'domain:'+value),...emails.map(value=>'email:'+value),
      ...[row.taskId,row.task_id,row.id,row.automationTaskId].filter(Boolean).map(value=>'id:'+value)
    ])];
  }
  // Preserve Array.find's first-source precedence without rescanning every row.
  function researchIndex(rows) {
    const byId = new Map();
    for (let position = 0; position < rows.length; position++) {
      const row = rows[position];
      if (row?.taskId && !byId.has(row.taskId)) byId.set(row.taskId, {row, position});
    }
    return byId;
  }
  function researchFor(record, index) {
    let first;
    for (const id of [record.taskId, record.id, record.automationTaskId]) {
      const match = index.get(id);
      if (match && (!first || match.position < first.position)) first = match;
    }
    return first?.row;
  }
  function modelClient(fetcher, now = Date.now) {
    const cache = new Map(), pending = new Map();
    const ttl = 3600000;
    function generate(task, publicFacts) {
      const key = JSON.stringify([task, publicFacts]);
      for (const [id, value] of cache) if (value.expires <= now()) cache.delete(id);
      const cached = cache.get(key);
      if (cached) return Promise.resolve({...cached.result, cached:true,
        usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}});
      if (pending.has(key)) return pending.get(key).then(result=>({...result,coalesced:true,
        usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}}));
      const promise = (async () => {
        const response = await fetcher('/api/models', {method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({task,publicFacts,publicDataConfirmed:true}),
          signal:AbortSignal.timeout(25000)});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || '模型请求失败');
        // Never cache failed, incomplete, or execution-authorizing responses.
        if (result.requiresReview !== true || result.sendPerformed !== false) throw new Error('Invalid advisory response');
        cache.set(key, {result, expires:now()+ttl});
        while (cache.size > 100) cache.delete(cache.keys().next().value);
        return result;
      })().finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    }
    return {generate};
  }
  // Cheap ordering only, never eligibility or ICP. No network/model calls.
  function prioritizeResearch(candidates) {
    return candidates.map((row,position)=>{
      const text=[row?.company,row?.name,row?.description,row?.industry,
        ...(Array.isArray(row?.keywords)?row.keywords:[])].join(' ').toLowerCase();
      const product=/\b(camping|outdoor|hiking|portable power|power bank|powerbank|camp lights?|portable pumps?)\b/.test(text);
      const channel=/\b(retail|distribut\w*|wholesale|import\w*|electronics|trading)\b/.test(text);
      const weak=/\b(bank|banking|real estate|restaurant|hotel|tourism|insurance)\b/.test(text);
      return {row,position,priority:(product?4:0)+(channel?2:0)-(weak&&!product?3:0)};
    }).sort((a,b)=>b.priority-a.priority||a.position-b.position).map(item=>item.row);
  }
  // Planning is not sending. A source failure stays parked until evidence changes.
  function researchBatch(candidates, {keys, blocked, research = [], limit = 100}) {
    const seen = new Set(), cached = new Map(), rows = [], counts = {historical:0,duplicate:0,parked:0};
    const parked = new Set(['excluded','source_failed','evidence_insufficient','parked','identity_mismatch']);
    const outcomeBlocks = new Set(['sent_confirmed','submitted_confirmed','send_unconfirmed',
      'send_clicked_outcome_unknown_do_not_resend','outcome_pending','replied','bounced']);
    const statuses = row => [row.researchStatus,row.status,row.sendStatus,row.automationStatus,row.result,row.state]
      .filter(value=>typeof value==='string').map(value=>value.trim().toLowerCase());
    const sources = row => new Set((row.evidenceSources || []).filter(url =>
      typeof url === 'string' && /^https?:\/\//i.test(url)));
    // Per-invocation snapshots: aliases share work, but later calls see new receipts.
    const metadata = new WeakMap();
    function describe(row) {
      if (!metadata.has(row)) {
        const state = statuses(row);
        metadata.set(row, {identity:keys(row).filter(Boolean),
          historical:state.some(status=>outcomeBlocks.has(status)),
          // Explicit cache no-retry flags also cover legacy custom status names.
          // Never infer eligibility from a name, a score, or a source URL alone.
          parked:row.retryWithoutNewEvidence===false || row.reResearchWithoutNewEvidence===false
            || state.some(status=>parked.has(status)), sources:sources(row)});
      }
      return metadata.get(row);
    }
    function newEvidence(row, previous) {
      if (!row.evidenceRevision || row.evidenceRevision === previous.evidenceRevision) return false;
      const old = describe(previous).sources;
      return [...describe(row).sources].some(url => !old.has(url));
    }
    // Retain every alias match. A later clean row cannot erase a group failure.
    for (const row of research) {
      if (!row) continue;
      const info = describe(row);
      for (const key of info.identity) {
        if (!cached.has(key)) cached.set(key,{historical:false,parked:new Set()});
        const bucket = cached.get(key);
        bucket.historical ||= info.historical;
        if (info.parked) bucket.parked.add(row);
      }
    }
    for (const row of candidates) {
      if (!row) continue;
      const current = describe(row), identity = current.identity;
      if (!identity.length) continue;
      const previous = identity.map(key=>cached.get(key)).filter(Boolean);
      if (blocked(row) || current.historical ||
          previous.some(bucket => bucket.historical)) {
        counts.historical++;continue;
      }
      if (identity.some(key=>seen.has(key))) {counts.duplicate++;continue;}
      if (current.parked || previous.some(bucket =>
          [...bucket.parked].some(item => !newEvidence(row,item)))) {
        counts.parked++;continue;
      }
      identity.forEach(key=>seen.add(key));rows.push(row);
      if (rows.length >= Math.min(100,Math.max(1,Number(limit)||100))) break;
    }
    return {rows,counts,sendPerformed:false,requiresLiveVerification:true};
  }
  root.OutreachEfficiency = {identityKeys, researchIndex, researchFor, modelClient, researchBatch, prioritizeResearch};
})(typeof window !== 'undefined' ? window : globalThis);
