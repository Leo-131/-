# Preserve an observed email subject

This explanatory excerpt preserves the subject that the controller actually verified in Sent evidence. It is not a complete patch and cannot be applied directly. No real customer, sender address, message identifier, screenshot or credential is included.

For a parsed attempt object `a`, choose and validate the subject before emitting a receipt proposal:

```js
const subject=Object.hasOwn(a,'subject')?a.subject:'FLEXTAIL global brand representation';
if(typeof subject!=='string'||!subject.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(subject))throw Error('Valid single-line email subject required');
```

Use the resulting `subject` string unchanged in both proposed daily and permanent receipt fields. Do not trim, normalize, translate or replace it during persistence. The call to `trim()` above checks only whether the input is blank; it does not alter the retained value. An absent property keeps the legacy default, whereas an explicitly present invalid value is rejected.

The validation rejects non-string or blank values, C0 and C1 controls, DEL, and Unicode line/paragraph separators. Existing screenshot evidence, strict qualification, actual date, message-identity deduplication and no-resend checks remain mandatory. A valid subject alone neither proves a send nor authorizes outreach.

The controller reported 27 focused helper tests passed, zero failed, including three subject regressions for exact UTF-8/whitespace preservation, absent-field compatibility and rejection without output or source-file writes. This is not a full-suite or provider-recovery claim. No long receipt-construction line or raw private source diff is published here.
