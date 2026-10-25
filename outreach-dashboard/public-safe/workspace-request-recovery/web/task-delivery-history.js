(function(root){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
 const stamp=value=>validTime(value)?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+' · 上海':'时间待核实';
 const labels={queued:'待执行器接收',running:'执行中',blocked:'受阻',failed:'失败',completed:'已完成',cancelled:'已取消'};
 function deliveryLabel(d){if(!d)return '尚无桥接投递凭据';if(d.status==='received')return 'AI 公司已持久接收通知 · '+(d.executionConnected?'桥接后台执行器已连接':'桥接后台执行器未连接；不代表当前 Codex 内置浏览器状态');return '桥接投递待核实：'+d.status;}
 function timeline(t,delivery){
  const events=(t.history||[]).map(e=>({...e,title:({submitted:'提交任务',claimed:'执行器领取',cancelled:'取消任务',checkpoint:'执行检查点'})[e.type]||'任务事件'}));
  // Source timestamps only; old records cannot reconstruct missing transitions.
  if(!events.length){
   if(validTime(t.createdAt))events.push({title:'来源记录：提交时间',occurredAt:t.createdAt,summary:'历史记录，未补造中间事件'});
   if(validTime(t.startedAt))events.push({title:'来源记录：领取时间',occurredAt:t.startedAt,summary:'历史记录'});
   if(validTime(t.updatedAt)&&t.updatedAt!==t.createdAt)events.push({title:'来源记录：最新状态',occurredAt:t.updatedAt,summary:t.summary});
  }
  for(const e of delivery?.history||(delivery?[delivery]:[])){
   events.push({title:e.status==='received'?'AI 公司持久接收通知':'桥接投递检查',occurredAt:e.checkedAt,summary:deliveryLabel(e)+(e.diagnostic?' · '+e.diagnostic:'')});
   if(e.status==='received')events.push({title:'接收端回执',occurredAt:e.receivedAt,summary:'通知回执；不等于客户执行或发送',evidence:[{reference:e.eventId||'待核实'}]});
  }
  return events.sort((a,b)=>(Date.parse(a.occurredAt)||0)-(Date.parse(b.occurredAt)||0));
 }
 function renderTask(t,delivery){const events=timeline(t,delivery);return `<article class="goal-record"><div><b>${esc(t.request.goal)}</b><p>${esc(t.request.market)} · ${t.completedCount}/${t.request.target} · ${esc(labels[t.status]||t.status)}</p><small>${esc(t.summary)}</small><p class="agent-status">${esc(deliveryLabel(delivery))}</p><details class="goal-task-timeline"><summary>事件时间线 · ${events.length} 条</summary>${events.length?`<ol>${events.map(e=>`<li><time>${esc(stamp(e.occurredAt))}</time><strong>${esc(e.title)}</strong><p>${esc(e.summary||'')}</p>${(e.evidence||[]).map(x=>`<small>凭据：${esc(x.reference||'待核实')}</small>`).join('')}</li>`).join('')}</ol>`:'<p>暂无有时间凭据的事件，待核实。</p>'}</details></div>${['queued','blocked'].includes(t.status)?`<button type="button" data-cancel-goal="${esc(t.id)}">取消任务</button>`:''}</article>`;}
 root.TaskDeliveryHistory=Object.freeze({timeline,renderTask,stamp,deliveryLabel});
})(typeof window!=='undefined'?window:globalThis);
