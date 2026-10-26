import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
for (const file of ['customer-event-ledger.js', 'customer-state.js']) {
  vm.runInNewContext(fs.readFileSync(new URL(`../web/${file}`, import.meta.url), 'utf8'), context);
}
const ledger = context.CustomerEventLedger;
const plain = value => JSON.parse(JSON.stringify(value));
const sentAt = '2026-10-20T10:00:00+08:00';
const replyAt = '2026-10-26T15:47:00+08:00';
const sourceUrl = 'https://www.linkedin.com/messaging/thread/example/';
const sent = () => ({task_id: 'verified-social-linkedin-example', company: 'Example Trading',
  channel: 'linkedin', status: 'sent_confirmed', timestamp: sentAt,
  evidence: 'Independently reopened outgoing message and retained receipt.'});
const progressed = () => ({...sent(), repliedAt: replyAt, replyType: 'human',
  replyEvidence: 'Customer explicitly requested reseller pricing and a test sample.', replySourceUrl: sourceUrl,
  contactCapturedAt: replyAt, contactEvidence: 'Customer supplied a business contact in the inbound message.',
  contactSourceUrl: sourceUrl, opportunityAt: replyAt,
  opportunityEvidence: 'Commercial-interest inquiry only; no agreed price, order or sale.', opportunitySourceUrl: sourceUrl});

test('result explicit reply, contact and opportunity dates reach the customer timeline', () => {
  const row = progressed(), before = JSON.stringify(row);
  const events = ledger.build({results: [row]});
  assert.deepEqual(plain(events.map(e => e.type)), ['sent_confirmed', 'replied', 'contact_captured', 'opportunity_created']);
  assert.equal(events.length, 4);
  for (const event of events.slice(1)) assert.equal(event.timestamp, replyAt);
  const state = context.CustomerState.build(row, ledger.forCustomer(events, row), Date.parse('2026-10-26T20:00:00+08:00'));
  assert.equal(state.timeline.length, 4);
  assert.deepEqual(plain(state.timeline.filter(e => e.time === replyAt).map(e => e.title).sort()),
    ['收到回复', '客户提供联系方式', '建立商机'].sort());
  assert.ok(state.timeline.every(e => e.verified));
  assert.equal(JSON.stringify(row), before);
});

test('adding later dated outcomes preserves the original outbound event exactly', () => {
  const original = ledger.build({results: [sent()]})[0];
  const after = ledger.build({results: [progressed()]}).find(e => e.type === 'sent_confirmed');
  assert.deepEqual(plain(after), plain(original));
});

test('field-specific evidence and source URLs never use the outgoing receipt as inbound proof', () => {
  const row = progressed(), events = ledger.build({results: [row]});
  for (const [type, field] of [['replied', 'replyEvidence'], ['contact_captured', 'contactEvidence'], ['opportunity_created', 'opportunityEvidence']]) {
    const event = events.find(e => e.type === type);
    assert.ok(event, type);
    assert.equal(event.evidence, row[field]);
    assert.equal(event.sourceUrl, sourceUrl);
    assert.equal(event.source, 'automation_result');
  }
});

test('absent dates and prose, including a legacy inbound marker, do not invent outcome timestamps', () => {
  const row = {...sent(), evidence: 'inbound_reply_visible; sample/order wording in an audit note only'};
  const events = ledger.build({results: [row]});
  assert.deepEqual(plain(events.map(e => e.type)), ['sent_confirmed']);
});

test('invalid explicit dates do not fall back to the send timestamp', () => {
  const row = {...progressed(), repliedAt: 'invalid', contactCapturedAt: 'invalid', opportunityAt: 'invalid',
    evidence: 'inbound_reply_visible'};
  const events = ledger.build({results: [row]});
  assert.deepEqual(plain(events.map(e => e.type)), ['sent_confirmed']);
});

test('an explicit automated reply remains automated and does not create purchase outcomes', () => {
  const row = {...sent(), repliedAt: replyAt, replyType: 'automated',
    replyEvidence: 'Automated acknowledgement; sample and order words are not a commercial event.'};
  const events = ledger.build({results: [row]});
  assert.equal(events.length, 2);
  const reply = events.find(e => e.type === 'replied');
  assert.equal(reply.status, 'auto_replied');
  assert.equal(reply.replyType, 'automated');
  const state = context.CustomerState.build(row, events, Date.parse('2026-10-27T00:00:00Z'));
  assert.equal(state.label, '收到自动回复');
  assert.ok(!events.some(e => ['opportunity_created', 'sample_sent', 'won'].includes(e.type)));
});

test('timestamp-only outcomes remain unverified when only outbound evidence exists', () => {
  const row = {...sent(), repliedAt: replyAt};
  const events = ledger.build({results: [row]});
  const reply = events.find(e => e.type === 'replied');
  assert.ok(reply);
  assert.equal(reply.evidence, 'repliedAt');
  assert.equal(reply.source, 'customer_record');
  const state = context.CustomerState.build(row, events, Date.parse('2026-10-27T00:00:00Z'));
  assert.equal(state.timeline.find(e => e.type === 'replied').verified, false);
});

test('the identical dated physical event in records and results deduplicates', () => {
  const row = {...progressed(), taskId: 'verified-social-linkedin-example', sentAt};
  const events = ledger.build({records: [row], results: [row, {...row}]});
  assert.equal(events.length, 4);
  assert.equal(new Set(events.map(e => e.id)).size, 4);
  assert.ok(events.every(e => e.source === 'automation_result'));
});

test('same task company spelling variants deduplicate but channels and task identities remain distinct', () => {
  const row = progressed();
  const aliases = ledger.build({results: [row, {...row, company: 'Example Trading LLC'}]});
  assert.equal(aliases.length, 4);
  const channels = ledger.build({results: [row, {...row, channel: 'email'}]});
  assert.equal(channels.length, 8);
  const tasks = ledger.build({results: [row, {...row, task_id: 'verified-social-linkedin-another'}]});
  assert.equal(tasks.length, 8);
});

test('explicit reply date takes precedence over a generic result timestamp for reply status', () => {
  const row = {...sent(), status: 'replied', repliedAt: replyAt, replyType: 'human',
    replyEvidence: 'Actual customer reply.', replySourceUrl: sourceUrl};
  const events = ledger.build({results: [row]});
  assert.equal(events.length, 1);
  assert.equal(events[0].timestamp, replyAt);
  assert.equal(events[0].replyType, 'human');
});

test('legacy replyAt is accepted only as its own explicit date, not inferred from a marker', () => {
  const row = {...sent(), replyAt, replyType: 'automated', replyEvidence: 'Actual automated reply.'};
  const events = ledger.build({results: [row]});
  assert.equal(events.length, 2);
  const reply = events.find(e => e.type === 'replied');
  assert.equal(reply.timestamp, replyAt);
  assert.equal(reply.status, 'auto_replied');
});

test('explicit recognized sample and meeting dates are mapped without inferring an order', () => {
  const row = {...sent(), sampleSentAt: replyAt, sampleEvidence: 'Shipment handoff evidence only.',
    sampleSourceUrl: 'https://example.test/shipment', meetingBookedAt: replyAt,
    meetingEvidence: 'Accepted meeting invitation.', meetingSourceUrl: 'https://example.test/meeting'};
  const events = ledger.build({results: [row]});
  assert.equal(events.length, 3);
  assert.equal(events.find(e => e.type === 'sample_sent').evidence, row.sampleEvidence);
  assert.equal(events.find(e => e.type === 'meeting_booked').sourceUrl, row.meetingSourceUrl);
  assert.ok(!events.some(e => e.type === 'won' || e.type === 'opportunity_created'));
});

test('legacy marker with a real positiveReplyAt retains the dated reply observation', () => {
  const row = {...sent(), positiveReplyAt: replyAt, evidence: 'recipient_auto_reply_received'};
  const events = ledger.build({results: [row]});
  const reply = events.find(e => e.type === 'replied');
  assert.ok(reply);
  assert.equal(reply.timestamp, replyAt);
  assert.equal(reply.status, 'auto_replied');
  assert.equal(reply.source, 'automation_reply_evidence');
  assert.equal(events.filter(e => e.type === 'sent_confirmed').length, 1);
});

test('a reply-status event with only its actual result timestamp preserves automated classification', () => {
  const row = {...sent(), status: 'replied', timestamp: replyAt, replyType: 'automated',
    replyEvidence: 'Actual automated response observation.', replySourceUrl: sourceUrl};
  const events = ledger.build({results: [row]});
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'auto_replied');
  assert.equal(events[0].replyType, 'automated');
  assert.equal(events[0].evidence, row.replyEvidence);
  assert.equal(events[0].sourceUrl, sourceUrl);
});

test('an invalid explicit reply date blocks fallback even on a replied status row', () => {
  const row = {...sent(), status: 'replied', repliedAt: 'invalid', replyEvidence: 'Unresolved reply timestamp.'};
  assert.equal(ledger.build({results: [row]}).length, 0);
});
