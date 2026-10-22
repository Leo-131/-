# Bounded normal-login recovery

The owner-private executor's decision contract now includes this normal saved-password flow. This guide contains no customer data, passwords, browser-instance identifiers or credentials.

```text
same user-authorized origin + observed login form + no authentication challenge
  empty field, not focused yet -> focus saved-password field once
  reobserve presence only; never read, print or store the password value
  filled field, not submitted yet -> submit normal login once
  submission pending -> observe the same operation; do not submit again
  authenticated page -> recheck live sender and company/group history
  empty after one focus / CAPTCHA / MFA / legal terms -> handoff
```

All recovery decisions retain `maySend: false`. Unknown send outcomes require reconciliation, not retry or alternate-channel sending. Origin mismatch, missing authorization and malformed observations fail closed. Transport recovery remains separate and bounded; recovery cannot grant access or weaken security.

Live validation covered one successful focus-triggered saved-password fill and normal login. It does not guarantee perpetual sessions, implement a mailbox daemon, or bypass manual verification. The full deployment-specific implementation remains in owner-private source.
