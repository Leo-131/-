# Safe outreach efficiency source (v3)

This folder retains its v2 path for compatibility but includes the v3 identity preflight and server model coalescing upgrade. It contains reusable code and synthetic tests only, not customer records or credentials. The actual integrated dashboard is deployed separately to the existing owner-private Sites project.

Run `node --test tests/*.test.mjs` from this directory. The CLI reads local candidate, history and research files but performs no network requests, paid model calls or sends. Keep its identity-bearing output local/private. Server `model-router.mjs` remains advisory-only and requires the existing authenticated route wrapper and server-side secret; it must not be exposed as an anonymous endpoint.

No website-to-IAB email executor or measured end-to-end outreach speedup is claimed.

The v10 local preflight additionally supports `--packet-size 10` to bound the
next research packet after the complete batch safety preflight. It refreshes
all local history each time; packets are not send-qualified. This reduces output
volume, not a measured end-to-end execution time. Never publish packet contents.

Use `--tasks-only` for a lean execution context with no duplicated row prose.
Exact company/group identities, conflicts and live checks are retained. This is
not authorization to send and does not establish eligibility. The private source
package uses this format in its `outreach:preflight` script.
