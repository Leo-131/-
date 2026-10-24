(async function(){
  const messages={request_timeout:'页面数据读取超时，请检查网络后重试。',state_unavailable:'在线存储未就绪，请稍后重试。',progress_unavailable:'新进度暂不可用，请稍后重试。',script_timeout:'必需页面资源加载超时，请检查网络后重试。',script_load_failed:'必需页面资源加载失败，请稍后重试。'};
  const bootError=code=>Object.assign(new Error(messages[code]),{code});
  async function readJson(url,deadlineMs=10000){
    const controller=new AbortController();let timer;
    // Bound fetch AND body parsing. A deadline does not prove cancellation;
    // late transport results have no state, navigation or UI side effects.
    const operation=Promise.resolve().then(async()=>{
      const response=await fetch(url,{signal:controller.signal});
      return {response,data:await response.json()};
    });
    try{return await Promise.race([operation,new Promise((_,reject)=>{
      timer=setTimeout(()=>{reject(bootError('request_timeout'));controller.abort();},deadlineMs);
    })]);}finally{clearTimeout(timer);}
  }
  try{
    const scripts=[...document.querySelectorAll('script[data-hosted-script]')];
    // Fetch independent assets together while preserving their execution order.
    for(const original of scripts)if(original.src){const link=document.createElement('link');link.rel='preload';link.as='script';link.href=original.src;document.head.append(link);}
    const [stateResult,progressResult]=await Promise.all([
      readJson('/api/state'),
      readJson('/api/progress').catch(()=>null)
    ]);
    const {response,data:state}=stateResult;
    if(state.accessRequired){location.replace('/login.html?returnTo='+encodeURIComponent(location.pathname+location.search));return;}
    if(!response.ok||!state.ok)throw bootError('state_unavailable');
    window.__outreachState=state;
    window.__outreachProgress=progressResult?.response.ok?progressResult.data:null;
    const globals={'public/outreach_data.json':'OUTREACH_SHEET_DATA','daily-automation-latest.js':'DAILY_AUTOMATION_LATEST','daily-automation-execution-latest.js':'DAILY_AUTOMATION_EXECUTION_LATEST','google-lead-discovery-latest.js':'GOOGLE_LEAD_DISCOVERY_LATEST','autonomous-outreach-results.js':'AUTONOMOUS_OUTREACH_RESULTS','outreach-intelligence-latest.js':'OUTREACH_INTELLIGENCE_LATEST','system-visibility-latest.js':'SYSTEM_VISIBILITY_LATEST','system-readiness-latest.js':'SystemReadinessData','github-sync/latest-status.js':'GITHUB_SYNC_LATEST'};
    const overrides=new Map();
    await Promise.all(Object.entries(window.__outreachProgress?.files||{}).filter(([,v])=>v.source==='desktop').map(async([file])=>{
      const {response:r,data}=await readJson('/api/progress/'+file,20000);
      if(!r.ok||!data.ok||!data.data)throw bootError('progress_unavailable');
      overrides.set(file,data.data);
    }));
    if(overrides.has('public/outreach_data.json'))window.OUTREACH_SHEET_DATA=overrides.get('public/outreach_data.json');
    for(const original of scripts){
      const file=original.src?new URL(original.src).pathname.slice(1):'';
      if(overrides.has(file)&&globals[file]){window[globals[file]]=overrides.get(file);continue;}
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        const optional=original.hasAttribute('data-optional');let settled=false,timer;
        const finish=code=>{
          if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;
          if(code){
            // Removing a node is cleanup, not proof that network/script execution stopped.
            script.remove();
            if(optional){
              (window.__outreachBootWarnings??=[]).push({asset:file,code});
              console.warn('Optional workspace resource unavailable:',file,code);
            }else{reject(bootError(code));return;}
          }
          resolve();
        };
        if(original.src){
          script.src=original.src;script.onload=()=>finish();script.onerror=()=>finish('script_load_failed');
          timer=setTimeout(()=>finish('script_timeout'),optional?3000:10000);
        }else script.textContent=original.textContent;
        try{original.after(script);if(!original.src)finish();}catch{finish('script_load_failed');}
      });
    }
    window.installHostedControls();
  }catch(error){
    document.body.classList.remove('command-center-booting');document.body.classList.add('command-center-active');
    const panel=document.createElement('main');panel.className='hosted-error';
    const title=document.createElement('h1');title.textContent='客户开发中心暂未加载';
    const message=document.createElement('p');message.textContent=Object.hasOwn(messages,error?.code)?messages[error.code]:'页面初始化失败，请检查网络后重试。';
    const retry=document.createElement('button');retry.textContent='重新加载';retry.onclick=()=>location.reload();
    panel.append(title,message,retry);document.body.append(panel);
  }
}());
