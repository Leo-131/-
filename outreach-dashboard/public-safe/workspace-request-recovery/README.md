# Bounded task request recovery (safe source extract)

Generic browser task-queue client and synthetic local tests only. No customer identities, contact data, message bodies, credentials or production task records are included.

The 10-second deadline covers both fetch and JSON parsing, including ignored aborts. Task POST/PATCH is never automatically replayed; ambiguous results remain unknown. Same-page unchanged task input retains its idempotency key, concurrent submits are guarded, and late results cannot replace current UI state. Explicit bridge checks own their status display so a historical task refresh cannot erase a current pending, confirmed or uncertain result. Backend bridge connectivity is not native browser authentication.

Run the isolated fast tests with Node.js:

```
node --test tests/workspace-request-timeout.test.mjs tests/task-delivery-history.test.mjs
```

The fixtures make no network requests and create no real customer tasks. Passing tests are not evidence of actual outreach, delivery or replies. This extract does not install an unattended execution host or bypass authentication, MFA, CAPTCHA or provider risk controls.
