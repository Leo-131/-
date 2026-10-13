# Complete-history local preflight

Code-only safety fix. No customer identities, addresses, credentials or receipt archives are included.

The routine CLI reads the four desktop exports plus the existing private source autonomous/discovery exports and browser-verification/mailbox-reconciliation overlays. Every input is reread and hashed; missing or malformed overlays fail closed. Historical source copies retain earlier locks if a desktop snapshot is replaced. Existing cross-channel/group locks, unknown-send suppression, source-cache exclusions and live verification requirements remain unchanged. This tool performs no network calls, model calls or sends.

Use `--site-history-dir` to point to the authorized private source web directory when running this public code package. Actual historical exports intentionally are not distributed here. Existing `--history-supplement` retained daily-history recovery is preserved.

Synthetic tests: `node --test tests/site-history-preflight.test.mjs`. Live CRM, public-business-contact, agency-region, product/role, canonical ICP and mailbox checks still precede each actual send. An absent local email is not a terminal contact failure, and a new email never clears an existing company/group contact lock.
