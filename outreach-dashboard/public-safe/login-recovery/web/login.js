(function(){
 'use strict';
 let pending=false,startupStarted=false,startupActive=true;
 const deadlineMs=10000;
 const unknownResult='登录结果尚未确认，未自动重复提交密码。请检查网络后手动重试。';
 function destination(){
  const fallback='/?view=agent',path=new URLSearchParams(location.search).get('returnTo');
  if(typeof path!=='string'||!path.startsWith('/'))return fallback;
  try{
   const target=new URL(path,location.href);let decoded=path;
   for(let depth=0;depth<8;depth++){
    if(!decoded.startsWith('/')||decoded.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(decoded))return fallback;
    const normalized=new URL(decoded,location.href);
    if(normalized.origin!==location.origin||normalized.pathname.startsWith('//')
      ||/^\/login(?:\.html)?\/*$/i.test(normalized.pathname))return fallback;
    const next=decodeURIComponent(decoded);
    if(next===decoded)return target.pathname+target.search+target.hash;
    decoded=next;
   }
  }catch{}
  return fallback;
 }
 async function accessRequest(method,body){
  const controller=new AbortController();let timer;
  // Bound both fetch and body parsing, including a transport that ignores abort.
  // Late outcomes have no UI or navigation side effects and are never retried.
  const operation=Promise.resolve().then(async()=>{
   const response=await fetch('/api/access',{method,credentials:'same-origin',cache:'no-store',
    ...(method==='POST'?{headers:{'Content-Type':'application/json'},body}:{}),signal:controller.signal});
   return {response,data:await response.json()};
  });
  try{
   return await Promise.race([operation,new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(new Error('access_request_timeout'));},deadlineMs);
   })]);
  }finally{clearTimeout(timer);}
 }
 document.querySelector('#access-form').addEventListener('submit',async e=>{
  e.preventDefault();startupActive=false;if(pending)return;
  pending=true;
  const button=e.target.querySelector('button'),error=document.querySelector('#access-error');
  button.disabled=true;error.textContent='';
  try{
   const {response,data}=await accessRequest('POST',JSON.stringify({password:document.querySelector('#access-password').value}));
   if(!response.ok||data?.ok!==true){
    // Never display arbitrary server or transport text that might echo a secret.
    error.textContent=response.status===401?'访问密码不正确':response.status===429?'请一分钟后重试':'登录未完成，请检查后重试。';
    return;
   }
   location.assign(destination());
  }catch{
   error.textContent='登录结果待核实，正在只读检查会话…';
   try{
    // A lost response may still have set the session cookie. Observe once only.
    const {response,data}=await accessRequest('GET');
    if(response.ok&&data?.ok===true&&data.authenticated===true)location.assign(destination());
    else error.textContent=unknownResult;
   }catch{error.textContent=unknownResult;}
  }finally{pending=false;button.disabled=false;}
 });
 async function inspectExistingSession(){
  if(startupStarted||!startupActive)return;
  startupStarted=true;
  try{
   // Static/clean-URL login assets can bypass the worker redirect. Observe once;
   // never read credentials or change form/error state during this startup check.
   const {response,data}=await accessRequest('GET');
   if(startupActive&&!pending&&response.ok&&data?.ok===true&&data.authenticated===true)
    location.assign(destination());
  }catch{}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inspectExistingSession,{once:true});
 else void inspectExistingSession();
}());
