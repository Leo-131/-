# Bounded task request recovery (safe source extract)

Generic browser task-queue client and synthetic local tests only. No customer identities, contact data, message bodies, credentials or production task records are included.

The 10-second deadline covers fetch, JSON parsing and request fingerprinting, including ignored aborts. Task POST/PATCH is never automatically replayed; ambiguous results remain unknown. A verified same-tab session checkpoint retains only SHA-256 payload fingerprints and opaque task IDs across page reloads and normal login returns. Goal text, credentials, recipients, message bodies and send consent are not stored or restored. Explicit retries reuse the pending ID; different payloads remain independent. Only an authenticated task read proving that exact ID completed or was cancelled retires its association. Storage or crypto failure stops before POST and releases the button. Concurrent submits are guarded, and late results cannot replace current UI state. Explicit bridge checks own their status display so a historical task refresh cannot erase a current pending, confirmed or uncertain result. Backend bridge connectivity is not native browser authentication.

Run the isolated fast tests with Node.js:

```
node --test tests/workspace-request-timeout.test.mjs tests/task-delivery-history.test.mjs
```

The fixtures make no network requests and create no real customer tasks. The private project's separate integration regression also exercises its actual task route using only an in-memory database; no production task is created. Passing tests are not evidence of actual outreach, delivery or replies. This extract does not extend session expiry, synchronize separate browser tabs, install an unattended execution host or bypass authentication, MFA, CAPTCHA or provider risk controls.
