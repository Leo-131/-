# Hosted startup recovery - public-safe source

This is the bounded startup-loader repair, not a standalone customer system or an unattended mail executor. It contains no customer identities, email records, credentials or private data.

- API fetch and JSON parsing: 10 seconds; current desktop override: 20 seconds.
- Optional script: 3 seconds, recorded warning and existing pending-data fallback.
- Essential script: 10 seconds; the exact required autonomous-outreach-results.js and outreach-intelligence-latest.js data assets receive a finite 30-second budget and cannot be downgraded to optional. Failure shows only the resource pathname and deadline, never query parameters.
- The built baseline ledger uses content-addressed required parts, each at most128records and128KiB including UTF-8 code. Both built HTML entrypoints preserve complete order and verify execution markers plus cumulative row totals. Missing or empty parts fail closed. The original source, baseline identity/hash and legacy JS remain intact.
- A newer desktop override skips all baseline parts, including preloads, and is assigned once. Apply build-integration.patch to the existing build and include scripts/ledger-chunks.mjs; this extract contains no actual customer data.
- Generated-data cleanup validates resolved paths, complete owned wrappers and hashes before deleting any generated file; unknown content and symlinks are rejected. Rebuilds retain only the current content hash.
- Late callbacks cannot resume initialization; removing an element is not proof that classic-script execution was cancelled.
- No automatic password retry, permission change, message send or resend.

Regression fixture: Node22 with jsdom26.1.0 available. From this directory run node --test tests/cloud-boot-timeout.test.mjs. Production integration still requires the existing hosted document, state APIs and runtime.

The corresponding production change passed32focused checks, including complete private-ledger reconstruction and temporary build fixtures; customer records and that private input are not published here. This public loader/runtime fixture and helper match the tested production source. Native acceptance loaded all32required parts and restored the customer table. This does not prove permanent connectivity, email delivery restoration or a connected unattended executor.
