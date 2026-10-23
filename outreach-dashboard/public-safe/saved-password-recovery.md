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

## Authenticated login-entry repair — 2026-10-24

An existing valid session previously received the password form again when opening an old `/login.html` URL or its clean `/login` equivalent. The server now redirects authenticated GET/HEAD requests to a validated same-origin destination, with the workspace as a safe fallback. Invalid, expired and different-account cookies still require normal authentication. External, encoded and self-loop redirects are rejected; cookie expiry, MFA, send locks and executor connection claims are unchanged.

The static login page also performs one bounded, read-only session check on startup because clean-URL assets can be served before the Worker route. Only a strict authenticated result navigates; an explicit form submission invalidates the startup result, and failures leave the form usable without another password POST.

`login-recovery/authenticated-entry.patch` contains only the actual safe server change and its seven new regression tests. The adjacent `web/login.js` and timeout-test files include nine new startup regressions. The Node22 focused authentication, recovery and diagnostic checks passed 92/92; this is not a full-suite or unattended-service claim. Deployment and live verification are recorded separately in the dated anonymous summary.
