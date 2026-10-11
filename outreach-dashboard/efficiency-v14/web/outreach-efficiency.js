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
  function researchPriority(row) {
      const text=[row?.company,row?.name,row?.description,row?.industry,row?.role,
        ...(Array.isArray(row?.keywords)?row.keywords:[])].join(' ').toLowerCase();
      const product=/\b(camping|outdoor|hiking|portable power|power bank|powerbank|camp lights?|portable pumps?)\b/.test(text);
      const channel=/\b(retail\w*|distribut\w*|wholesale\w*|import\w*|trading)\b/.test(text);
      const adjacent=/\b(electronics|appliances|consumer goods)\b/.test(text);
      const weak=/\b(bank|banking|real estate|properties|interiors|mep|exhibition|institute|restaurant|hotel\w*|tourism|tour operator|safari tours?|insurance|school|academy|university|construction|contracting|fitness club|golf club|training)\b/.test(text);
      // Provider descriptions are unverified routing clues. An outdoor tour is
      // not a retail channel; keep it available, but do not enrich it first.
      return {priority:(product?4:0)+(channel?3:0)+(adjacent?1:0)-(weak?8:0),
        signals:[...(product?['product-keyword']:[]),...(channel?['channel-keyword']:[]),
          ...(adjacent?['adjacent-category']:[]),...(weak?['non-channel-keyword']:[])],
        trust:'unverified-routing-only',eligibleToSend:false};
  }
  function prioritizeResearch(candidates) {
    return candidates.map((row,position)=>({row,position,...researchPriority(row)}))
    .sort((a,b)=>b.priority-a.priority||a.position-b.position).map(item=>item.row);
  }
  // Planning is not sending. A source failure stays parked until evidence changes.
  function researchBatch(candidates, {keys, blocked, research = [], limit = 100, screenOnly = false}) {
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
      if (!screenOnly && identity.some(key=>seen.has(key))) {counts.duplicate++;continue;}
      if (current.parked || previous.some(bucket =>
          [...bucket.parked].some(item => !newEvidence(row,item)))) {
        counts.parked++;continue;
      }
      identity.forEach(key=>seen.add(key));rows.push(row);
      if (!screenOnly && rows.length >= Math.min(100,Math.max(1,Number(limit)||100))) break;
    }
    return {rows,counts,sendPerformed:false,requiresLiveVerification:true};
  }
  // One synchronous snapshot: screen locks before enrichment, then dedup survivors.
  // Never reuse across invocations; fresh receipts must take effect immediately.
  function researchPlan(candidates, options) {
    const screened=researchBatch(candidates,{...options,screenOnly:true});
    const ordered=prioritizeVerification(prioritizeResearch(researchContext(screened.rows,options.research||[])));
    const seen=new Set(),rows=[];let duplicate=0;
    const cap=Math.min(100,Math.max(1,Number(options.limit)||100));
    for(const row of ordered) {
      const keys=options.keys(row).filter(Boolean);
      if(keys.some(key=>seen.has(key))){duplicate++;continue;}
      keys.forEach(key=>seen.add(key));rows.push(row);
      if(rows.length>=cap)break;
    }
    return {rows,counts:{...screened.counts,duplicate},sendPerformed:false,
      requiresLiveVerification:true,preflightWork:{candidateRows:candidates.length,
        contextRows:screened.rows.length,skippedContextRows:candidates.length-screened.rows.length}};
  }
  // Carry bounded existing facts into the next packet, not into send authorization.
  // Group-only matches remain locks; a subsidiary must not inherit another firm's contact.
  function researchContext(rows, research) {
    const index=new Map();
    const directKeys=row=>identityKeys({...row,group:undefined,groupName:undefined,
      parentCompany:undefined,groupAliases:[],taskId:undefined,task_id:undefined,
      id:undefined,automationTaskId:undefined});
    for(const record of research) {
      if(!record || typeof record!=='object')continue;
      for(const key of directKeys(record)) {
        if(!index.has(key))index.set(key,new Set());
        index.get(key).add(record);
      }
    }
    const cleanUrl=value=>{
      try {const url=new URL(value);
        return /^https?:$/.test(url.protocol)&&!url.username&&!url.password
          && ![...url.searchParams.keys()].some(k=>/token|secret|password|api.?key/i.test(k))?url.href:null;
      }catch{return null;}
    };
    return rows.map(row=>{
      const matches=new Set(directKeys(row).flatMap(key=>[...(index.get(key)||[])]));
      if(!matches.size)return {...row};
      const sources=new Set(),emails=new Set(),scores=new Set();
      for(const record of matches) {
        for(const value of [...(Array.isArray(record.sources)?record.sources:[]),
          ...(Array.isArray(record.evidenceSources)?record.evidenceSources:[])]) {
          const url=cleanUrl(value);if(url)sources.add(url);
        }
        for(const key of ['publicEmail','publicBusinessEmail','contactEmail','email']) {
          const value=String(record[key]||'').trim().toLowerCase();
          if(/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value))emails.add(value);
        }
        const score=record.icpScore??record.icp;
        if(typeof score==='number'&&Number.isFinite(score)&&score>=0&&score<=100)scores.add(score);
      }
      return {...row,cachedResearch:{matchedRecords:matches.size,
        sourceUrls:[...sources].slice(0,6),sourceCount:sources.size,
        contactCandidates:[...emails].slice(0,3),contactConflict:emails.size>1,
        observedScores:[...scores].slice(0,3),scoreConflict:scores.size>1,
        trust:'cached-leads-only-live-validation-required',eligibleToSend:false}};
    });
  }
  // Verify existing source/contact leads first, never treat cached scores as gates.
  // Stable order preserves product/channel ordering within each evidence tier.
  function prioritizeVerification(rows) {
    const tier=row=>{
      const facts=row?.cachedResearch;
      if(!facts || facts.contactConflict || facts.scoreConflict)return 0;
      return facts.sourceUrls?.length ? (facts.contactCandidates?.length ? 2 : 1) : 0;
    };
    return rows.map((row,position)=>({row,position,tier:tier(row)}))
      .sort((a,b)=>b.tier-a.tier||a.position-b.position).map(item=>item.row);
  }
  // Compact next-action facts only. Cached or provider facts never satisfy live gates.
  // Do not guess contact/product URLs, infer geography from TLDs, or expose raw fields.
  const researchPolicy=Object.freeze({
    preflightOrder:'permanent-and-cache-locks-before-context-enrichment',
    keywordIntentMeaning:'category-relevance-proxy-not-expressed-purchase-intent',
    requiredLiveChecks:Object.freeze(['daily-agency-region','current-product-and-buyer-role',
      'public-contact-source','canonical-ICP>70','company-and-group-CRM-and-mail-dedup']),
    onPrimarySourceFailure:'record-reason-and-switch-candidate',
    verificationOrder:Object.freeze(['current-product-and-buyer-role','public-contact-source',
      'canonical-ICP-and-live-safety-gates']),
    onRoleOrProductMismatch:'record-primary-evidence-and-switch-before-contact-enrichment',
    trust:'research-routing-only',eligibleToSend:false});
  function verificationTask(row) {
    const facts=row?.cachedResearch;
    const sourceUrls=(facts?.sourceUrls || []).slice(0,6);
    const contactCandidates=(facts?.contactCandidates || []).slice(0,3);
    return {company:row.company || row.name || '',
      ...(row.country || row.countryMarket?{country:row.country || row.countryMarket}:{}),
      ...(sourceUrls.length?{sourceUrls}:{}),
      ...(contactCandidates.length?{contactCandidates}:{}),
      ...(facts?.contactConflict===true?{contactConflict:true}:{}),
      missingCachedLeads:[...(!sourceUrls.length?['official-source']:[]),
        ...(!contactCandidates.length?['public-business-contact']:[]),
        ...(!row.country&&!row.countryMarket?['country']:[])],
      eligibleToSend:false};
  }
  root.OutreachEfficiency = {identityKeys, researchIndex, researchFor, modelClient, researchBatch, researchPlan, researchPriority, prioritizeResearch, researchContext, prioritizeVerification, verificationTask, researchPolicy};
})(typeof window !== 'undefined' ? window : globalThis);

