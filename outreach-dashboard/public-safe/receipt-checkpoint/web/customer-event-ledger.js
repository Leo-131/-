(function exposeCustomerEventLedger(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CustomerEventLedger = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCustomerEventLedger() {
  const buildIndexes = new WeakMap();
  const RECORD_EVENT_FIELDS = Object.freeze({
    sentAt: 'sent_confirmed',
    repliedAt: 'replied',
    replyAt: 'replied',
    bouncedAt: 'bounced',
    contactCapturedAt: 'contact_captured',
    buyerRoutedAt: 'buyer_routed',
    meetingBookedAt: 'meeting_booked',
    positiveReplyAt: 'positive_reply',
    qualifiedAt: 'qualified',
    opportunityAt: 'opportunity_created',
    sampleSentAt: 'sample_sent',
    quotationSentAt: 'quotation_sent',
    wonAt: 'won',
    followUpAt: 'follow_up_due',
    sentTime: 'sent_confirmed',
  });
  const STATUS_EVENT_TYPES = Object.freeze({
    sent_confirmed: 'sent_confirmed',
    submitted_confirmed: 'sent_confirmed',
    replied: 'replied',
    bounced: 'bounced',
    buyer_routed: 'buyer_routed',
    meeting_booked: 'meeting_booked',
    positive_reply: 'positive_reply',
    qualified: 'qualified',
    opportunity_created: 'opportunity_created',
    sample_sent: 'sample_sent',
    quotation_sent: 'quotation_sent',
    won: 'won',
  });
  const EVENT_PROOF_FIELDS = Object.freeze({
    replied: ['replyEvidence', 'replySourceUrl'],
    bounced: ['bounceEvidence', 'bounceSourceUrl'],
    contact_captured: ['contactEvidence', 'contactSourceUrl'],
    buyer_routed: ['buyerRoutedEvidence', 'buyerRoutedSourceUrl'],
    meeting_booked: ['meetingEvidence', 'meetingSourceUrl'],
    positive_reply: ['positiveReplyEvidence', 'positiveReplySourceUrl'],
    qualified: ['qualificationEvidence', 'qualificationSourceUrl'],
    opportunity_created: ['opportunityEvidence', 'opportunitySourceUrl'],
    sample_sent: ['sampleEvidence', 'sampleSourceUrl'],
    quotation_sent: ['quotationEvidence', 'quotationSourceUrl'],
    won: ['wonEvidence', 'wonSourceUrl'],
    follow_up_due: ['followUpEvidence', 'followUpSourceUrl'],
  });
  const LEGACY_REPLY_MARKER = /recipient_(?:auto_)?reply_received|recipient_replied|inbound_reply_(?:received|visible)|reply_bubble_visible/i;

  function replyClassification(item, evidence) {
    const explicit = String(item && item.replyType || '').toLowerCase();
    if (explicit === 'human') return 'human';
    if (explicit === 'automated' || item && item.status === 'auto_replied'
      || /recipient_auto_reply_received|automated_reply/i.test(evidence || '')) return 'automated';
    return 'unclassified';
  }

  function validTimestamp(value) {
    return typeof value === 'string' && value && Number.isFinite(Date.parse(value)) ? value : '';
  }
  function canonical(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^google-customer-/i, '')
      .replace(/^verified-[a-z]+-/i, '')
      .replace(/-(instagram|facebook|website-contact)$/i, '')
      .replace(/^@/, '')
      .replace(/[^a-z0-9.]+/g, '');
  }
  function inferChannel(item) {
    // Explicit execution identity beats incidental channel names in audit prose.
    const explicit = String(item && (item.channel || item.platform) || '').toLowerCase();
    if (/^(email|mail|website-contact|contact_form|official_website)$/.test(explicit)) return 'email';
    if (/^(linkedin|facebook|instagram)$/.test(explicit)) return explicit;
    if (item && item.recipientEmail) return 'email';
    if (/^verified-email-/i.test(String(item && (item.task_id || item.taskId) || ''))) return 'email';
    const text = [
      item && (item.channel || item.platform),
      item && (item.target_url || item.targetUrl || item.url),
      item && (item.task_id || item.taskId),
      item && item.evidence,
    ].join(' ').toLowerCase();
    if (/linkedin/.test(text)) return 'linkedin';
    if (/facebook|messenger|fb\.com/.test(text)) return 'facebook';
    if (/instagram/.test(text)) return 'instagram';
    if (/mailto|email|website-contact|contact_form|official_website/.test(text)) return 'email';
    return 'unknown';
  }
  function customerKeys(item) {
    return [
      item && (item.task_id || item.taskId || item.automationTaskId || item.id),
      item && item.company,
      item && item.name,
      item && item.sourceCompany,
    ].map(canonical).filter(Boolean);
  }
  function makeEvent(input) {
    const timestamp = validTimestamp(input.timestamp);
    const type = String(input.type || '').trim();
    const keys = [...new Set((input.customerKeys || []).map(canonical).filter(Boolean))];
    if (!timestamp || !type || !keys.length) return null;
    const channel = input.channel || 'unknown';
    const source = input.source || 'unknown';
    const evidence = String(input.evidence || '');
    const id = [keys[0], type, channel, timestamp, canonical(evidence)].join('|');
    return Object.freeze({
      id,
      customerKey: keys[0],
      customerKeys: Object.freeze(keys),
      type,
      channel,
      timestamp,
      evidence,
      source,
      taskId: input.taskId || '',
      status: input.status || type,
      ...(input.sourceUrl ? {sourceUrl: input.sourceUrl} : {}),
      ...(input.replyType ? {replyType: input.replyType} : {}),
    });
  }
  function eventsFromDatedFields(item, source) {
    if (!item || typeof item !== 'object') return [];
    return Object.entries(RECORD_EVENT_FIELDS).map(([field, type]) => {
      const timestamp = validTimestamp(item[field]);
      if (!timestamp) return null;
      // repliedAt is canonical; replyAt remains a supported legacy explicit date.
      if (field === 'replyAt' && validTimestamp(item.repliedAt)) return null;
      const [proofField, sourceField] = EVENT_PROOF_FIELDS[type] || [];
      const genericEvidence = String(item.evidence || item.automationEvidence || '');
      const legacyReplyProof = type === 'replied' && LEGACY_REPLY_MARKER.test(genericEvidence)
        ? genericEvidence : '';
      const evidence = type === 'sent_confirmed' ? genericEvidence
        : String(item[proofField] || legacyReplyProof || '');
      const replyType = type === 'replied' ? replyClassification(item, evidence) : '';
      return makeEvent({
        customerKeys: customerKeys(item), type, channel: inferChannel(item), timestamp,
        evidence: evidence || field,
        // A date alone is not proof of the outcome, even on a confirmed send row.
        source: source === 'automation_result' && !evidence ? 'customer_record' : source,
        sourceUrl: item[sourceField] || '',
        taskId: item.task_id || item.taskId || item.automationTaskId || '',
        status: type === 'replied' ? (replyType === 'automated' ? 'auto_replied' : 'replied')
          : type === 'sent_confirmed' ? (item.sendStatus || item.status || type) : type,
        replyType,
      });
    }).filter(Boolean);
  }
  function eventsFromResults(results) {
    return (Array.isArray(results) ? results : []).flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const status = String(item && item.status || '').toLowerCase();
      const type = STATUS_EVENT_TYPES[status];
      const dated = eventsFromDatedFields(item, 'automation_result');
      const events = [];
      const [baseProofField, baseSourceField] = EVENT_PROOF_FIELDS[type] || [];
      const baseEvidence = type === 'sent_confirmed' ? (item.evidence || item.target_url || '')
        : (item[baseProofField] || item.evidence || item.target_url || '');
      const baseReplyType = type === 'replied' ? replyClassification(item, baseEvidence) : '';
      const base = type && makeEvent({
          customerKeys: customerKeys(item),
          type,
          channel: inferChannel(item),
          timestamp: item.timestamp,
          evidence: baseEvidence,
          source: 'automation_result',
          taskId: item.task_id || '',
          status: baseReplyType === 'automated' ? 'auto_replied' : status,
          sourceUrl: type === 'sent_confirmed' ? '' : (item[baseSourceField] || ''),
          replyType: baseReplyType,
        });
      // Preserve the historical outbound event. Explicit outcome dates beat the
      // generic result timestamp for all other statuses.
      const explicitOutcomeDate = Object.entries(RECORD_EVENT_FIELDS)
        .some(([field, eventType]) => eventType === type && item[field]);
      if (base && (type === 'sent_confirmed' || !explicitOutcomeDate)) events.push(base);
      events.push(...dated.filter(event => !(base && type === 'sent_confirmed' && event.type === 'sent_confirmed')));
      const evidence = String(item && item.evidence || '');
      if (status === 'sent_confirmed'
        && LEGACY_REPLY_MARKER.test(evidence)
        && !dated.some(event => event.type === 'replied')
        && validTimestamp(item.positiveReplyAt)) {
        const replyType = replyClassification(item, evidence);
        events.push(makeEvent({
          customerKeys: customerKeys(item),
          type: 'replied',
          channel: inferChannel(item),
          timestamp: item.positiveReplyAt,
          evidence,
          source: 'automation_reply_evidence',
          taskId: item.task_id || '',
          status: replyType === 'automated' ? 'auto_replied' : 'replied',
          sourceUrl: item.replySourceUrl || '',
          replyType,
        }));
      }
      return events.filter(Boolean);
    });
  }
  function eventsFromAudit(audit) {
    return (Array.isArray(audit) ? audit : []).map(item => {
      const status = String(item && (item.result || item.stage) || '').toLowerCase();
      const type = STATUS_EVENT_TYPES[status];
      if (!type) return null;
      return makeEvent({
        customerKeys: customerKeys(item),
        type,
        channel: inferChannel(item),
        timestamp: item.timestamp,
        evidence: item.evidence || '',
        source: 'automation_audit',
        taskId: item.taskId || '',
        status,
      });
    }).filter(Boolean);
  }
  function eventsFromRecords(records) {
    return (Array.isArray(records) ? records : [])
      .flatMap(record => eventsFromDatedFields(record, 'customer_record'));
  }
  function build({ results = [], audit = [], records = [] } = {}) {
    const byId = new Map();
    [...eventsFromRecords(records), ...eventsFromAudit(audit), ...eventsFromResults(results)]
      .forEach(event => {
        const existing = byId.get(event.id);
        if (!existing || event.source === 'automation_result') byId.set(event.id, event);
      });
    const events = Object.freeze([...byId.values()]
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)));
    const byCustomerKey = new Map();
    events.forEach(event => event.customerKeys.forEach(key => {
      const bucket = byCustomerKey.get(key) || [];
      bucket.push(event);
      byCustomerKey.set(key, bucket);
    }));
    buildIndexes.set(events, byCustomerKey);
    return events;
  }
  function forCustomer(events, record, types) {
    const keys = new Set(customerKeys(record));
    const allowed = Array.isArray(types) && types.length ? new Set(types) : null;
    const index = buildIndexes.get(events);
    const candidates = index
      ? [...new Map([...keys].flatMap(key => index.get(key) || []).map(event => [event.id, event])).values()]
      : (Array.isArray(events) ? events : []).filter(event => event.customerKeys.some(key => keys.has(key)));
    return candidates
      .filter(event => !allowed || allowed.has(event.type));
  }
  function latest(events, record, types) {
    const index = buildIndexes.get(events);
    if (index) {
      const allowed = Array.isArray(types) && types.length ? new Set(types) : null;
      let newest = null;
      customerKeys(record).forEach(key => {
        const bucket = index.get(key) || [];
        for (let position = bucket.length - 1; position >= 0; position -= 1) {
          const event = bucket[position];
          if (allowed && !allowed.has(event.type)) continue;
          if (!newest || Date.parse(event.timestamp) > Date.parse(newest.timestamp)) newest = event;
          break;
        }
      });
      return newest;
    }
    const matches = forCustomer(events, record, types);
    let newest = null;
    for (const event of matches) {
      if (!newest || Date.parse(event.timestamp) > Date.parse(newest.timestamp)) newest = event;
    }
    return newest;
  }

  return Object.freeze({
    build,
    latest,
    forCustomer,
    validTimestamp,
    canonical,
  });
}));
