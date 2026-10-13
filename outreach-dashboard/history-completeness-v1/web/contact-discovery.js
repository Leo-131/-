(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ContactDiscovery=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const aliases={li:'linkedin',ins:'instagram',ig:'instagram',fb:'facebook'};
  const platform=v=>aliases[String(v||'').toLowerCase()]||String(v||'').toLowerCase();
  function email(value){const v=String(value||'').trim().replace(/^mailto:/i,'').split('?')[0];return /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i.test(v)&&!/@(?:flextailgear|flextail)\.com$/i.test(v)?v:'';}
  function url(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
  function social(value){const v=url(value);if(!v)return null;const u=new URL(v),h=u.hostname.toLowerCase(),p=u.pathname.split('/').filter(Boolean);let type='';
    if(/(^|\.)linkedin\.com$/.test(h)&&['company','in'].includes(p[0])&&p[1])type='linkedin';
    if(/(^|\.)instagram\.com$/.test(h)&&p.length===1&&!['accounts','explore','direct','p','reel','reels','stories','share'].includes(p[0]))type='instagram';
    if(/(^|\.)(facebook\.com|fb\.com)$/.test(h)&&p.length&& !['profile.php','watch','reel','reels','share','sharer.php','search','login','groups','marketplace','plugins','dialog','hashtag'].includes(p[0])&&!p.includes('posts')&&!p.includes('videos'))type='facebook';
    if(!type)return null;u.search='';u.hash='';return {type,value:u.href};
  }
  function profileFields(r){const out={};for(const k of ['email','emails','contactEmail','publicEmail','contact','contactPoints','contactSearch','contactFallback','contactCheckedAt','publicEmailStatus','emailSource','emailSourceUrl','source','sourceUrl','evidenceUrl','identitySource','country','countryEn','fitScore','icpScore','fitTier','website','companyWebsite','contactUrl','vendorPortal','linkedin_url','linkedinUrl','linkedinCompany','linkedin','instagram_url','instagramUrl','facebook_url','facebookUrl','alternateChannels','invalidChannels','role','buyerPersona','qualification','fitSource','scoreCaveat'])if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')out[k]=r[k];return out;}
  function points(record){const out=new Map(),r=record||{},sourceUrl=url(r.emailSourceUrl||r.emailSource||r.sourceUrl||r.source||r.evidenceUrl),checkedAt=r.contactCheckedAt||r.timestamp||r.resultCheckedAt||'';
    const add=p=>{const value=p.type==='email'?email(p.value):url(p.value);if(!value)return;const key=p.type+'|'+value.toLowerCase(),old=out.get(key);if(!old||(!old.sourceUrl&&p.sourceUrl)||p.status==='published')out.set(key,{...p,value});};
    for(const p of (Array.isArray(r.contactPoints)?r.contactPoints:[])){if(p.type==='email')add(p);else {const s=social(p.value);if(s)add({...p,...s});}}
    const values=[r.contactEmail,r.publicEmail,r.email,r.contact,...(Array.isArray(r.emails)?r.emails.map(v=>typeof v==='string'?v:v.email):[]),/^mailto:/i.test(r.targetUrl||r.target_url||'')?(r.targetUrl||r.target_url):''];
    for(const v of values){if(!email(v))continue;add({type:'email',value:v,sourceUrl,checkedAt,status:sourceUrl?'recorded_public_source':'candidate'});}
    const alt=r.alternateChannels||{},invalid=r.invalidChannels||{};
    for(const v of [r.linkedin_url,r.linkedinUrl,r.linkedinCompany,r.linkedin,r.instagram_url,r.instagramUrl,r.facebook_url,r.facebookUrl,alt.linkedin,alt.instagram,alt.facebook,r.targetUrl,r.target_url,r.verifiedTargetUrl,r.platformUrl]){const p=social(v);if(!p||invalid[p.type])continue;add({...p,status:r.verifiedTargetUrl===v?'recorded_verified':'candidate',sourceUrl:url(r.identitySource||r.evidenceUrl||r.source),checkedAt});}
    const contact=url(r.contactUrl||alt.websiteContact||r.vendorPortal);if(contact&&!social(contact))add({type:'website',value:contact,status:'candidate',sourceUrl:contact,checkedAt});
    return [...out.values()];
  }
  function searchPlan(record){const company=String(record.company||record.name||'').split(' / ')[0].trim().replace(/"/g,' '),country=String(record.country||'').replace(/global|unspecified|unknown/ig,'').trim();if(!company)return [];
    const q='"'+company+'" '+country;const google=s=>'https://www.google.com/search?q='+encodeURIComponent(s);
    const result=[{label:'公开邮箱 · Google',url:google(q+' email contact Kontakt contacto')},{label:'公开邮箱 · Bing',url:'https://www.bing.com/search?q='+encodeURIComponent(q+' email contact')},{label:'LinkedIn 联系信息',url:google(q+' site:linkedin.com email contact')},{label:'Instagram 官方主页',url:google(q+' site:instagram.com')},{label:'Facebook 官方主页',url:google(q+' site:facebook.com')}];
    const website=url(record.website||record.companyWebsite||record.contactUrl||record.source);if(website&&!social(website)){result.unshift({label:'官网联系页',url:website});result.push({label:'官网邮箱检索',url:google('site:'+new URL(website).hostname+' email contact Kontakt Impressum about team')});}
    const li=points(record).find(p=>p.type==='linkedin');if(li)result.splice(2,0,{label:'已收录 LinkedIn',url:li.value});
    return result;
  }
  const fallbackOrder=Object.freeze(['official_website','linkedin_decision_makers','official_instagram','official_facebook']);
  const seniorRoles=Object.freeze(['CEO','Founder','Procurement Director','Purchasing Director','Product Director','Category Director']);
  function contactFallbackPlan(record, options={}) {
    const r=record||{}, attempts=Array.isArray(r.contactFallback?.attempts)?r.contactFallback.attempts:[];
    const states=[r.status,r.sendStatus,r.automationStatus,r.result,r.state];
    const locked=options.companyOrGroupBlocked===true || r.doNotResend===true || r.previouslyContacted===true || !!r.sentAt || !!r.repliedAt || states.some(s=>['sent_confirmed','submitted_confirmed','send_unconfirmed','send_clicked_outcome_unknown_do_not_resend','outcome_pending','replied','bounced','identity_mismatch'].includes(s));
    const done=stage=>attempts.some(a=>a.stage===stage && Number.isFinite(Date.parse(a.checkedAt)) && url(a.sourceUrl) && ['not_found','unavailable','verified'].includes(a.outcome));
    const websiteChecked=done('official_website') || Boolean(r.contactSearch?.checkedAt && url(r.contactSearch.sourceUrl) && ['not_found','failed'].includes(r.contactSearch.status));
    const candidates=points(r), publishedEmail=candidates.find(p=>p.type==='email'&&p.status==='published'&&url(p.sourceUrl));
    const seniorEmail=candidates.find(p=>p.type==='email'&&p.status==='published'&&p.roleVerified===true&&p.employerVerified===true&&p.businessEmailVerified===true&&url(p.roleSourceUrl)&&url(p.employerSourceUrl)&&url(p.sourceUrl)&&seniorRoles.some(role=>String(p.role||'').toLowerCase()===role.toLowerCase()));
    const verifiedSocial=candidates.find(p=>['instagram','facebook'].includes(p.type)&&p.status==='published'&&p.officialCompanyVerified===true&&url(p.sourceUrl));
    const company=String(r.company||r.name||'').replace(/"/g,' ').trim();
    const country=String(r.country||r.countryMarket||'').replace(/unknown|unspecified|global/ig,'').trim();
    const query='"'+company+'" '+country;
    const search=q=>'https://www.google.com/search?q='+encodeURIComponent(q);
    const steps=[{stage:'official_website',label:'官网公开业务邮箱',urls:searchPlan(r).filter(p=>p.label.startsWith('官网')).map(p=>p.url)},
      {stage:'linkedin_decision_makers',label:'LinkedIn 高级决策层工作邮箱',roles:[...seniorRoles],urls:[search(query+' site:linkedin.com/company/'),search(query+' site:linkedin.com/in/ (CEO OR founder OR "procurement director" OR "purchasing director" OR "product director" OR "category director")')]},
      {stage:'official_instagram',label:'官方 Instagram 商务建联',urls:[search(query+' site:instagram.com')]},
      {stage:'official_facebook',label:'官方 Facebook 商务建联',urls:[search(query+' site:facebook.com')]}];
    let nextStage=locked?null:!websiteChecked?'official_website':seniorEmail||publishedEmail?'verify_email_and_live_gates':verifiedSocial?'verify_social_and_live_gates':fallbackOrder.slice(1).find(stage=>!done(stage))||null;
    // Recorded addresses and profiles are leads, never send authorization. A
    // LinkedIn email needs employer, seniority and public business provenance.
    if(publishedEmail && /linkedin/i.test(publishedEmail.sourceUrl) && !seniorEmail && !locked)nextStage=websiteChecked?'linkedin_decision_makers':'official_website';
    return {version:'contact-fallback-v1',order:[...fallbackOrder],nextStage,
      state:locked?'company_group_locked':nextStage?'research_or_verification_required':'channels_exhausted_evidence_pending',
      steps,requiredChecks:['company-and-group-permanent-lock','daily-open-region','current-company-product-fit','canonical-ICP>70','current-employer-and-senior-role-for-person','public-business-contact-provenance','official-company-social-identity','live-cross-channel-dedup'],
      noEmailIsTerminalFailure:false,noGuessedEmail:true,paidEnrichmentRequiresApproval:true,
      confirmedContactRequired:true,eligibleToSend:false,sendPerformed:false};
  }
  function recordFallbackAttempt(record, attempt, options={}) {
    const plan=contactFallbackPlan(record,options);
    if(plan.state==='company_group_locked')throw new Error('Company/group is locked; no cross-channel retry');
    if(!fallbackOrder.includes(attempt?.stage)||attempt.stage!==plan.nextStage)throw new Error('Only the next contact stage may be recorded');
    if(!Number.isFinite(Date.parse(attempt.checkedAt))||!url(attempt.sourceUrl)||!['not_found','unavailable','verified'].includes(attempt.outcome)||!String(attempt.evidence||'').trim())throw new Error('Contact attempt needs timestamp, public source, outcome and evidence');
    return {...record,contactFallback:{version:'contact-fallback-v1',attempts:[...(record.contactFallback?.attempts||[]),{stage:attempt.stage,checkedAt:attempt.checkedAt,sourceUrl:url(attempt.sourceUrl),outcome:attempt.outcome,evidence:String(attempt.evidence).slice(0,1200)}]}};
  }
  function emailState(r){if(points(r).some(p=>p.type==='email'))return 'recorded';return r.contactSearch?.checkedAt?(r.contactSearch.status==='failed'?'lookup_failed':'not_found'):'not_searched';}
  return Object.freeze({email,url,social,platform,profileFields,points,searchPlan,emailState,contactFallbackPlan,recordFallbackAttempt,fallbackOrder,seniorRoles});
});
