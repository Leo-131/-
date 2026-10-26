(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CustomerState=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const labels={sent_confirmed:'已确认发送',replied:'收到回复',bounced:'退信',contact_captured:'客户提供联系方式',buyer_routed:'转交采购',meeting_booked:'预约会议',positive_reply:'积极回复',qualified:'完成资格核验',opportunity_created:'建立商机',sample_sent:'寄送样品',quotation_sent:'发送报价',won:'成交',follow_up_due:'跟进排期'};
  const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:'';
  const fields={discoveredAt:'发现客户',profiledAt:'客户背调',approvedAt:'开发审核',followUpAt:'跟进排期',scheduledTime:'开发排期'};
  function build(record,ledgerEvents=[],now=Date.now()){
    const events=new Map();
    for(const event of ledgerEvents){
      if(!labels[event.type]||!time(event.timestamp))continue;
      // An imported timestamp or a URL alone is not execution verification.
      const verified=/^automation_(result|audit|reply_evidence)$/.test(event.source||'')&&!!event.evidence&&!/^https?:\/\/\S+$/.test(event.evidence);
      const item={time:event.timestamp,title:event.status==='auto_replied'?'收到自动回复':labels[event.type],type:event.type,channel:event.channel||'unknown',detail:event.evidence||'',source:event.source||'',verified,planned:event.type==='follow_up_due',taskId:event.taskId||''};
      const key=[item.type,item.channel,item.time].join('|');const old=events.get(key);
      if(!old||(!old.verified&&verified))events.set(key,item);
    }
    for(const [field,title] of Object.entries(fields)){
      if(!time(record[field]))continue;
      const planned=field==='followUpAt'||field==='scheduledTime';
      if(field==='followUpAt'&&[...events.values()].some(e=>e.type==='follow_up_due'&&e.time===record[field]))continue;
      events.set(field+'|'+record[field],{time:record[field],title,type:field,channel:record.platform||'unknown',detail:'',source:'customer_record',verified:false,planned});
    }
    const timeline=[...events.values()].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)||a.type.localeCompare(b.type));
    const occurred=timeline.filter(e=>!e.planned&&Date.parse(e.time)<=now);
    const current=occurred.find(e=>e.verified)||occurred[0];
    const next=timeline.filter(e=>e.planned&&Date.parse(e.time)>=now).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time))[0];
    return {timeline,current,next,label:current?current.title:(record.status?String(record.status):'待研究'),verified:!!current?.verified};
  }
  return Object.freeze({build});
});
