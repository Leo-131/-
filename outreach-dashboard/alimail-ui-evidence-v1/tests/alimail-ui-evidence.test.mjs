import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAliMailUiEvidence, verifyAliMailUiEvidence, aliMailUiEvidenceContract,
  aliMailUiRecoveryDecision } from '../server/alimail-ui-evidence.mjs';

const urls=['https://materials.example.test/overview','https://materials.example.test/catalog?revision=2'];
const lines=['Dear New Team,','A portable range for your actual category.',
  'Overview: '+urls[0],'Catalog: '+urls[1],'Regards, Example Sales'];
const expected={body:lines.join('\n\n'),links:urls,subject:'Portable range for New'};
const sent=(body=lines,extra='')=>`- generic: 收件人：\n- generic: old@example.test\n- iframe:\n${body.map(t=>'  - generic: '+JSON.stringify(t)).join('\n')}\n${extra}`;
const composer=(body=lines,{subject=expected.subject,recipient='new@example.test',extra=''}={})=>
  `- generic "收件人":\n  - generic: 收件人\n  - generic: ${recipient}\n  - combobox "收件人"\n- generic "主题":\n  - textbox "主题": ${subject}\n- button "插入模板":\n- button "More":\n${body.map(t=>'- generic: '+JSON.stringify(t)).join('\n')}\n- article\n- button "发送":\n  - generic: 发送\n- button "存草稿":\n${extra}`;
const check=(snapshot,overrides={})=>verifyAliMailUiEvidence({snapshot,surface:'composer',
  expected,sendState:'prepared_not_sent',...overrides});

test('current last composer wins over hidden old Sent and previous composer',()=>{
  const old=['Dear Old Team,','Old message '+urls[0]];
  const snapshot=sent(old)+composer(old)+composer();
  const r=check(snapshot); assert.equal(r.ok,true);assert.equal(r.evidence.bodyNormalized,lines.join(' '));
  assert.equal(r.maySend,false);assert.equal(r.mayRetrySend,false);
  assert.ok(r.evidence.scope.startLine>0);
});

test('whole-page expected text cannot repair a mismatched current body',()=>{
  const r=check(sent()+composer(['Dear Other Team,',...lines.slice(1)]));
  assert.equal(r.ok,false);assert.ok(r.reasons.includes('body_mismatch'));
});

test('body whitespace only is normalized; punctuation and extra text remain exact',()=>{
  assert.equal(check(composer(lines.map(t=>'  '+t.replaceAll(' ','\u00a0')+'  '))).ok,true);
  assert.equal(check(composer([...lines,'Unexpected extra promise.'])).ok,false);
  assert.equal(check(composer(lines.map(t=>t.replace('category.','category!')))).ok,false);
});

test('wrong, missing, reordered and additional visible URLs fail closed',()=>{
  for(const body of [lines.map(t=>t.replace(urls[1],urls[1]+'&changed=1')),
    lines.filter(t=>!t.includes(urls[1])),[lines[0],lines[1],lines[3],lines[2],lines[4]],
    [...lines,'Extra: https://other.example.test/']]){
    const r=check(composer(body));assert.equal(r.ok,false);assert.ok(r.reasons.includes('links_mismatch'));
  }
});

test('AX hyperlink text matching expected URL never permits a different actual href',()=>{
  const rich=`- generic: Dear New Team,\n- generic: A portable range for your actual category.\n- text: "Overview:"\n- link "${urls[0]}":\n  - /url: https://wrong.example.test/\n- text: "Catalog:"\n- link "${urls[1]}":\n  - /url: ${urls[1]}\n- generic: Regards, Example Sales`;
  const snap=composer().replace(lines.map(t=>'- generic: '+JSON.stringify(t)).join('\n'),rich);
  const r=check(snap);assert.equal(r.ok,false);assert.ok(r.reasons.includes('links_mismatch'));
});

test('correct AX hrefs and visible body text are independently matched',()=>{
  const rich=`- generic: Dear New Team,\n- generic: A portable range for your actual category.\n- text: "Overview:"\n- link "${urls[0]}":\n  - /url: ${urls[0]}\n- text: "Catalog:"\n- link "${urls[1]}":\n  - /url: ${urls[1]}\n- generic: Regards, Example Sales`;
  const snap=composer().replace(lines.map(t=>'- generic: '+JSON.stringify(t)).join('\n'),rich);
  const r=check(snap);assert.equal(r.ok,true);assert.equal(r.evidence.linkEvidence,'ax_hrefs');
});

test('plain composer URLs explicitly do not claim an actual href read',()=>{
  const r=check(composer());assert.equal(r.ok,true);assert.equal(r.evidence.linkEvidence,'visible_url_text');
  assert.equal(r.actualHrefVerificationRequired,true);
});

test('subject and optional recipient must be in the current composer header',()=>{
  assert.equal(check(sent()+composer(lines,{subject:'Wrong'})).ok,false);
  assert.equal(check(sent()+composer(lines,{recipient:'other@example.test'}),
    {expected:{...expected,recipient:'new@example.test'}}).ok,false);
  assert.equal(check(composer(),{expected:{...expected,recipient:'new@example.test'}}).ok,true);
  assert.equal(check(composer(lines,{recipient:'display-name-only'}),
    {expected:{...expected,recipient:'new@example.test'}}).ok,false);
});

test('subject email cannot impersonate the current recipient field',()=>{
  const subject='Hello new@example.test';
  const r=check(composer(lines,{recipient:'display-name-only',subject}),
    {expected:{...expected,subject,recipient:'new@example.test'}});
  assert.equal(r.ok,false);assert.ok(r.reasons.includes('recipient_mismatch_or_unverified'));
});

test('missing current boundaries cannot borrow old Sent or tooltip content',()=>{
  for(const snapshot of [sent(),composer().replace('- button "More":\n',''),
    composer().replace('- button "发送":','- button "not-send":'),
    '- tooltip "old":\n'+composer().split('\n').map(l=>'  '+l).join('\n')])
    assert.equal(check(snapshot).ok,false);
});

test('body strings named More, Send and recipients are data, never control boundaries',()=>{
  const body=['More','发送','收件人','Dear New Team,',...lines.slice(1)];
  const r=check(composer(body),{expected:{...expected,body:body.join('\n')}});
  assert.equal(r.ok,true);
});

test('template picker blocks validation even if underlying Send is visible',()=>{
  for(const extra of ['- dialog "邮件模板":\n  - generic: 营销模板2',
    '- menu:\n  - menuitem "营销模板2"', '- button "插入模板" [expanded]:'])
    assert.ok(check(composer(lines,{extra})).reasons.includes('template_picker_open'));
  assert.equal(check(composer(),{templatePanelOpen:true}).ok,false);
});

test('hidden controls and tooltip trees cannot alter current body or template state',()=>{
  const extra='- tooltip "old expected":\n  - iframe:\n    - generic: old\n- dialog "邮件模板" [hidden]:\n  - menuitem "营销模板2"';
  assert.equal(check(composer(lines,{extra})).ok,true);
});

test('Sent selects the last real iframe and excludes tooltip fake frames',()=>{
  const snap=sent(['Old text'])+sent()+`- tooltip "old":\n  - iframe:\n    - generic: Wrong tooltip body`;
  const r=verifyAliMailUiEvidence({snapshot:snap,surface:'sent',expected:{body:expected.body,links:urls},sendState:'send_unconfirmed'});
  assert.equal(r.ok,true);assert.equal(r.evidence.surface,'sent');assert.equal(r.mayRetrySend,false);
});

test('Sent iframe with current composer present is not a new receipt',()=>{
  const r=verifyAliMailUiEvidence({snapshot:sent()+composer(),surface:'sent',expected,sendState:'send_unconfirmed'});
  assert.equal(r.ok,false);assert.ok(r.reasons.includes('current_composer_present'));
});

test('last Sent frame cannot borrow an earlier message header',()=>{
  const old='- generic: 收件人：\n- generic: new@example.test\n- generic: 主 题：\n- generic: '+expected.subject+'\n- iframe:\n  - generic: Old body\n';
  const frame='- iframe:\n'+lines.map(t=>'  - generic: '+JSON.stringify(t)).join('\n');
  const r=verifyAliMailUiEvidence({snapshot:old+frame,surface:'sent',
    expected:{...expected,recipient:'new@example.test'},sendState:'send_unconfirmed'});
  assert.equal(r.ok,false);assert.ok(r.reasons.includes('subject_mismatch'));
  assert.ok(r.reasons.includes('recipient_mismatch_or_unverified'));
});

test('embedded Send button cannot truncate extra current body content',()=>{
  const nested='- iframe:\n'+lines.map(t=>'  - generic: '+JSON.stringify(t)).join('\n')+
    '\n  - button "发送":\n  - generic: An extra unapproved promise.';
  const snap=composer().replace(lines.map(t=>'- generic: '+JSON.stringify(t)).join('\n'),nested);
  const r=check(snap);assert.equal(r.ok,false);assert.ok(r.reasons.includes('body_mismatch'));
});

test('Send outcome unknown or already sent never revalidates a Send',()=>{
  for(const sendState of ['send_unconfirmed','send_clicked_outcome_unknown_do_not_resend','unknown','sent_confirmed',undefined]){
    const r=check(composer(),{sendState});assert.equal(r.ok,false);assert.equal(r.maySend,false);assert.equal(r.mayRetrySend,false);
  }
});

test('malformed observations or expectations fail without throwing or global includes',()=>{
  for(const input of [null,{},123,'', 'x'.repeat(2_000_001)])assert.equal(extractAliMailUiEvidence(input).ok,false);
  for(const e of [{},{body:expected.body},{body:expected.body,links:['javascript:alert(1)']},
    {body:expected.body,links:[{text:urls[0],href:urls[0]}]}])assert.equal(check(composer(),{expected:e}).ok,false);
});

test('semantic control recovery requires a fresh unique observation and at most one attempt',()=>{
  assert.equal(aliMailUiRecoveryDecision({operation:'compose_control',sendState:'prepared_not_sent'}).action,'fresh_native_ax_required');
  const ready={operation:'compose_control',sendState:'prepared_not_sent',freshNativeObservation:true,
    uniqueVisibleControls:1,priorOperationSettled:true,attempts:0};
  assert.equal(aliMailUiRecoveryDecision(ready).action,'recover_control_once');
  assert.equal(aliMailUiRecoveryDecision({...ready,attempts:1}).action,'checkpoint_and_isolate');
  for(const patch of [{uniqueVisibleControls:2},{priorOperationSettled:false}])
    assert.notEqual(aliMailUiRecoveryDecision({...ready,...patch}).action,'recover_control_once');
});

test('Send timeout recovery is observation-only regardless of matching controls',()=>{
  for(const x of [{operation:'send',sendState:'prepared_not_sent'},
    {operation:'compose_control',sendState:'send_unconfirmed'}]){
    const r=aliMailUiRecoveryDecision({...x,freshNativeObservation:true,uniqueVisibleControls:1,priorOperationSettled:true});
    assert.equal(r.action,'reconcile_sent_only');assert.equal(r.mayRetrySend,false);assert.equal(r.restartBrowser,false);
  }
});

