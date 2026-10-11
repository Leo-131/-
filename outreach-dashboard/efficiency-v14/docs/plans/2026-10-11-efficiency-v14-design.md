# Efficiency v14: history data fast path

Scope: speed up local preflight without weakening contact authorization.
Options considered: persistent snapshot caching risks stale receipts; parallel sends
risk duplicate contact; parsing pure data exports avoids unnecessary VM work.
Use strict JSON parsing only for the exact expected global. Retain isolated VM
evaluation for legacy computed exports. Fresh bytes are read and hashed every run.
Expose separate input, history and planning timings. These are not end-to-end
outreach timings. In-app browser, canonical ICP, regional protection, live dedup,
serial sending and durable receipt requirements remain unchanged.
Validate strict data, legacy exports, wrong globals, malformed input and fresh
receipt invalidation. Publish only after tests and build succeed.

