(function(root) {
  'use strict';
  const blocking = new Set(['sent_confirmed', 'submitted_confirmed', 'send_unconfirmed',
    'send_clicked_outcome_unknown_do_not_resend', 'outcome_pending', 'replied', 'bounced', 'identity_mismatch']);
  const blocks = row => row.doNotResend || [row.status,row.sendStatus,row.result,row.automationStatus,row.state]
    .some(status => blocking.has(status));
  function build(rows, keys) {
    const index = new Map();
    for (const row of rows) {
      if (!row) continue;
      if (!blocks(row) && !row.previouslyContacted && !row.sentAt && !row.repliedAt) continue;
      for (const key of keys(row)) if (key) index.set(key, row);
    }
    return index;
  }
  function blocked(record, index, keys) {
    // A later failed-open event cannot erase an earlier send or uncertain send.
    return Boolean(record.previouslyContacted || record.sentAt || record.repliedAt
      || blocks(record)
      || keys(record).some(key => index.has(key)));
  }
  root.OutreachQueueGuard = {build, blocked};
})(typeof window !== 'undefined' ? window : globalThis);
