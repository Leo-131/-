# Hosted startup recovery - public-safe source

This is the bounded startup-loader repair, not a standalone customer system or an unattended mail executor. It contains no customer identities, email records, credentials or private data.

- API fetch and JSON parsing: 10 seconds; current desktop override: 20 seconds.
- Optional script: 3 seconds, recorded warning and existing pending-data fallback.
- Essential script: 10 seconds, explicit visible failure and manual reload only.
- Late callbacks cannot resume initialization; removing an element is not proof that classic-script execution was cancelled.
- No automatic password retry, permission change, message send or resend.

Regression fixture: Node22 with jsdom26.1.0 available. From this directory run node --test tests/cloud-boot-timeout.test.mjs. Production integration still requires the existing hosted document, state APIs and runtime.

Eleven focused synthetic cases cover hangs, abort-ignoring transport, late callbacks, error sanitization and ordinary ordered startup. They are not a forced production failure test or proof of permanent connectivity.
